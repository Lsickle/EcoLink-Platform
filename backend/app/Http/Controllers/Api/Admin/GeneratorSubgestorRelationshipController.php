<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Concerns\LogsSecurityEvents;
use App\Http\Controllers\Controller;
use App\Models\GeneratorSubgestorRelationship;
use App\Models\Organization;
use App\Notifications\GeneratorRelationshipCreatedNotification;
use App\Policies\GeneratorSubgestorRelationshipPolicy;
use App\Services\UserProvisioningService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;

/**
 * Cadena Generador -> Subgestor -> Gestor en Declaración de Residuos
 * (confirmado por stakeholders reales, 2026-08-09). Ver docblock de la
 * migración create_generator_subgestor_relationships_table para el detalle
 * completo de las decisiones aplicadas (mismo patrón que
 * `GestorCarrierAuthorizationController`, roles invertidos).
 *
 * Un solo registro VIGENTE por par (Generador, Subgestor) -- `store()` crea
 * el par si no existe, o REACTIVA (in-place) el registro existente si estaba
 * revocado. Rechaza con 422 si YA existe un registro VIGENTE para ese par.
 *
 * `Waste::isForwardableBySubgestor()`/`WasteController::index()`/
 * `WasteTreatmentApprovalController::storeForWaste()` consumen este registro
 * para decidir si un Subgestor puede ver/reenviar el residuo de un Generador
 * con el que NO comparte organización.
 */
class GeneratorSubgestorRelationshipController extends Controller
{
    use LogsSecurityEvents;

    public function index(Request $request)
    {
        $actor = $request->user();
        abort_unless((new GeneratorSubgestorRelationshipPolicy)->viewAny($actor), 403, 'No tiene permiso para consultar relaciones Generador-Subgestor.');

        $relationships = GeneratorSubgestorRelationship::query()
            ->when(! $actor->isPlatformStaff(), function ($query) use ($actor) {
                $query->where(function ($query) use ($actor) {
                    $query->where('generator_organization_id', $actor->tenant_organization_id)
                        ->orWhere('subgestor_organization_id', $actor->tenant_organization_id);
                });
            })
            ->when($request->boolean('active_only'), fn ($query) => $query->where('is_active', true))
            ->with(['generatorOrganization:id,legal_name', 'subgestorOrganization:id,legal_name'])
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 15));

        return response()->json($relationships);
    }

    public function show(Request $request, GeneratorSubgestorRelationship $relationship)
    {
        abort_unless((new GeneratorSubgestorRelationshipPolicy)->view($request->user(), $relationship), 403, 'No tiene acceso a esta relación Generador-Subgestor.');

        $relationship->load(['generatorOrganization:id,legal_name', 'subgestorOrganization:id,legal_name', 'authorizedBy:id,username', 'revokedBy:id,username']);

        return response()->json(['generator_subgestor_relationship' => $relationship]);
    }

    /**
     * Solo el Subgestor DUEÑO de `subgestor_organization_id` puede registrar
     * un Generador cliente. Anti-IDOR: `generator_organization_id` debe
     * pertenecer a una organización REAL con `can_generate_waste=true`.
     */
    public function store(Request $request)
    {
        $actor = $request->user();

        // Anti-role-smuggling (mismo criterio que GestorCarrierAuthorizationController::store()):
        // un tenant admin SIEMPRE registra desde SU PROPIA organización.
        $subgestorOrganizationId = $actor->isPlatformStaff()
            ? $request->integer('subgestor_organization_id')
            : $actor->tenant_organization_id;

        abort_unless((new GeneratorSubgestorRelationshipPolicy)->create($actor, $subgestorOrganizationId), 403, 'No tiene permiso para registrar Generadores clientes.');

        $rules = [
            'generator_organization_id' => ['required', 'integer', 'exists:organizations,id'],
            'observations' => ['sometimes', 'nullable', 'string'],
            'metadata' => ['sometimes', 'nullable', 'array'],
        ];

        if ($actor->isPlatformStaff()) {
            $rules['subgestor_organization_id'] = ['required', 'integer', 'exists:organizations,id'];
        }

        $data = $request->validate($rules);
        $generatorOrganizationId = (int) $data['generator_organization_id'];

        if ($generatorOrganizationId === (int) $subgestorOrganizationId) {
            throw ValidationException::withMessages([
                'generator_organization_id' => ['Una organización no puede registrarse a sí misma como su propio Generador cliente.'],
            ]);
        }

        $this->assertOrganizationCanGenerateWaste($generatorOrganizationId);
        $this->assertOrganizationCanTransportWaste((int) $subgestorOrganizationId);

        $existing = GeneratorSubgestorRelationship::query()
            ->where('generator_organization_id', $generatorOrganizationId)
            ->where('subgestor_organization_id', $subgestorOrganizationId)
            ->first();

        if ($existing !== null && $existing->is_active) {
            throw ValidationException::withMessages([
                'generator_organization_id' => ['Ya existe una relación vigente con este Generador.'],
            ]);
        }

        $relationship = self::createOrReactivate($generatorOrganizationId, (int) $subgestorOrganizationId, $actor, $data['observations'] ?? null, $data['metadata'] ?? null);

        $this->logSecurityEvent(
            $request, 'GENERATOR_SUBGESTOR_RELATIONSHIP_CREATED', 'SUCCESS',
            "Generador (organización #{$generatorOrganizationId}) registrado como cliente del Subgestor #{$subgestorOrganizationId}.", $actor,
            ['generator_subgestor_relationship_id' => $relationship->id, 'generator_organization_id' => $generatorOrganizationId, 'subgestor_organization_id' => $subgestorOrganizationId],
        );

        return response()->json(['generator_subgestor_relationship' => $relationship->fresh(['generatorOrganization:id,legal_name', 'subgestorOrganization:id,legal_name'])], 201);
    }

    /**
     * Crea el vínculo si no existe, o lo REACTIVA in-place si estaba
     * revocado. A diferencia del flujo HTTP normal (`store()`, que rechaza
     * con 422 un par YA vigente), este método es el reutilizado por
     * `GeneratorBulkImportService` -- ahí SÍ es válido (idempotente) volver
     * a "crear" un vínculo que ya está vigente (recargar el mismo CSV no
     * debe fallar).
     *
     * Notifica por correo a los usuarios del Generador con
     * `generator_subgestor_relationships.read` (hallazgo de
     * `especialista-seguridad`, 2026-08-12 -- ver
     * `GeneratorRelationshipCreatedNotification`) cada vez que el vínculo
     * pasa de no-vigente a vigente (creación o reactivación) -- NO se
     * reenvía en el caso idempotente de arriba (par ya vigente), para no
     * reenviar el mismo aviso en cada recarga de un CSV.
     */
    public static function createOrReactivate(int $generatorOrganizationId, int $subgestorOrganizationId, \App\Models\User $actor, ?string $observations = null, ?array $metadata = null): GeneratorSubgestorRelationship
    {
        $existing = GeneratorSubgestorRelationship::query()
            ->where('generator_organization_id', $generatorOrganizationId)
            ->where('subgestor_organization_id', $subgestorOrganizationId)
            ->first();

        if ($existing !== null && $existing->is_active) {
            return $existing;
        }

        $relationship = $existing ?? new GeneratorSubgestorRelationship;
        $relationship->fill([
            'generator_organization_id' => $generatorOrganizationId,
            'subgestor_organization_id' => $subgestorOrganizationId,
            'observations' => $observations,
            'metadata' => $metadata,
        ]);
        $relationship->forceFill([
            'is_active' => true,
            'authorized_by' => $actor->id,
            'authorized_at' => now(),
            'revoked_by' => null,
            'revoked_at' => null,
            'created_by' => $relationship->exists ? $relationship->created_by : $actor->id,
            'updated_by' => $actor->id,
        ]);
        $relationship->save();

        $subgestorOrganization = Organization::query()->find($subgestorOrganizationId);
        $recipients = \App\Models\User::activeUsersInOrganizationWithPermission($generatorOrganizationId, 'generator_subgestor_relationships.read');
        $reachableRecipients = $recipients->reject(fn ($user) => UserProvisioningService::hasPlaceholderEmail($user));

        if ($subgestorOrganization !== null && $reachableRecipients->isNotEmpty()) {
            Notification::send($reachableRecipients, new GeneratorRelationshipCreatedNotification($subgestorOrganization, 'Subgestor'));
        } elseif ($subgestorOrganization !== null && $recipients->isNotEmpty()) {
            // Respaldo (decisión del usuario, 2026-08-13) -- ver docblock
            // gemelo en `GeneratorGestorRelationshipController::createOrReactivate()`.
            $generatorOrganization = Organization::query()->find($generatorOrganizationId);

            if ($generatorOrganization?->email !== null) {
                Notification::route('mail', $generatorOrganization->email)
                    ->notify(new GeneratorRelationshipCreatedNotification($subgestorOrganization, 'Subgestor'));
            }
        }

        return $relationship;
    }

    /**
     * Solo el Subgestor dueño puede revocar. NO borra el registro -- lo
     * marca `is_active=false`, mismo criterio que
     * `GestorCarrierAuthorization::revoke()`. Evaluaciones YA reenviadas
     * bajo esta relación NO se ven afectadas (`forwarded_by_organization_id`
     * ya quedó fijado en esas filas) -- solo bloquea reenvíos NUEVOS a
     * partir de la revocación.
     */
    public function revoke(Request $request, GeneratorSubgestorRelationship $relationship)
    {
        $actor = $request->user();
        abort_unless((new GeneratorSubgestorRelationshipPolicy)->revoke($actor, $relationship), 403, 'No tiene acceso a esta relación Generador-Subgestor.');

        if (! $relationship->is_active) {
            throw ValidationException::withMessages([
                'generator_subgestor_relationship' => ['Esta relación ya está revocada.'],
            ]);
        }

        $relationship->forceFill([
            'is_active' => false,
            'revoked_by' => $actor->id,
            'revoked_at' => now(),
            'updated_by' => $actor->id,
        ])->save();

        $this->logSecurityEvent(
            $request, 'GENERATOR_SUBGESTOR_RELATIONSHIP_REVOKED', 'SUCCESS',
            "Relación con el Generador (organización #{$relationship->generator_organization_id}) revocada por el Subgestor #{$relationship->subgestor_organization_id}.", $actor,
            ['generator_subgestor_relationship_id' => $relationship->id],
        );

        return response()->json(['generator_subgestor_relationship' => $relationship->fresh(['generatorOrganization:id,legal_name', 'subgestorOrganization:id,legal_name'])]);
    }

    private function assertOrganizationCanGenerateWaste(int $organizationId): void
    {
        $organization = Organization::query()->find($organizationId);

        if (! $organization || ! $organization->hasCapability('can_generate_waste')) {
            throw ValidationException::withMessages([
                'generator_organization_id' => ['Solo organizaciones con capacidad de generar residuos pueden registrarse como Generador cliente.'],
            ]);
        }
    }

    private function assertOrganizationCanTransportWaste(int $organizationId): void
    {
        $organization = Organization::query()->find($organizationId);

        if (! $organization || ! $organization->hasCapability('can_transport_waste')) {
            throw ValidationException::withMessages([
                'subgestor_organization_id' => ['Solo organizaciones con capacidad de transporte pueden registrar Generadores clientes.'],
            ]);
        }
    }
}
