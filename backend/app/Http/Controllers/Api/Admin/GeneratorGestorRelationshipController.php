<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Concerns\LogsSecurityEvents;
use App\Http\Controllers\Controller;
use App\Models\GeneratorGestorRelationship;
use App\Models\Organization;
use App\Notifications\GeneratorRelationshipCreatedNotification;
use App\Policies\GeneratorGestorRelationshipPolicy;
use App\Services\UserProvisioningService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;

/**
 * Vínculo comercial DIRECTO Generador -> Gestor (Carga Masiva de
 * Generadores, confirmado por el usuario 2026-08-11). Ver docblock de la
 * migración create_generator_gestor_relationships_table para el detalle
 * completo -- mismo patrón que `GeneratorSubgestorRelationshipController`,
 * roles invertidos.
 *
 * Un solo registro VIGENTE por par (Generador, Gestor) -- `store()` crea el
 * par si no existe, o REACTIVA (in-place) el registro existente si estaba
 * revocado. NO es error volver a llamar `store()` con un par ya vigente
 * (idempotente) -- `GeneratorBulkImportService` recarga el mismo CSV sin
 * fallar cuando el vínculo ya existe.
 */
class GeneratorGestorRelationshipController extends Controller
{
    use LogsSecurityEvents;

    public function index(Request $request)
    {
        $actor = $request->user();
        abort_unless((new GeneratorGestorRelationshipPolicy)->viewAny($actor), 403, 'No tiene permiso para consultar relaciones Generador-Gestor.');

        $relationships = GeneratorGestorRelationship::query()
            ->when(! $actor->isPlatformStaff(), function ($query) use ($actor) {
                $query->where(function ($query) use ($actor) {
                    $query->where('generator_organization_id', $actor->tenant_organization_id)
                        ->orWhere('gestor_organization_id', $actor->tenant_organization_id);
                });
            })
            ->when($request->boolean('active_only'), fn ($query) => $query->where('is_active', true))
            ->with(['generatorOrganization:id,legal_name', 'gestorOrganization:id,legal_name'])
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 15));

        return response()->json($relationships);
    }

    public function show(Request $request, GeneratorGestorRelationship $relationship)
    {
        abort_unless((new GeneratorGestorRelationshipPolicy)->view($request->user(), $relationship), 403, 'No tiene acceso a esta relación Generador-Gestor.');

        $relationship->load(['generatorOrganization:id,legal_name', 'gestorOrganization:id,legal_name', 'authorizedBy:id,username', 'revokedBy:id,username']);

        return response()->json(['generator_gestor_relationship' => $relationship]);
    }

    /**
     * Solo el Gestor DUEÑO de `gestor_organization_id` puede registrar un
     * Generador cliente. Anti-IDOR: `generator_organization_id` debe
     * pertenecer a una organización REAL con `can_generate_waste=true`.
     */
    public function store(Request $request)
    {
        $actor = $request->user();

        // Anti-role-smuggling (mismo criterio que
        // GeneratorSubgestorRelationshipController::store()): un tenant
        // admin SIEMPRE registra desde SU PROPIA organización.
        $gestorOrganizationId = $actor->isPlatformStaff()
            ? $request->integer('gestor_organization_id')
            : $actor->tenant_organization_id;

        abort_unless((new GeneratorGestorRelationshipPolicy)->create($actor, $gestorOrganizationId), 403, 'No tiene permiso para registrar Generadores clientes.');

        $rules = [
            'generator_organization_id' => ['required', 'integer', 'exists:organizations,id'],
            'observations' => ['sometimes', 'nullable', 'string'],
            'metadata' => ['sometimes', 'nullable', 'array'],
        ];

        if ($actor->isPlatformStaff()) {
            $rules['gestor_organization_id'] = ['required', 'integer', 'exists:organizations,id'];
        }

        $data = $request->validate($rules);
        $generatorOrganizationId = (int) $data['generator_organization_id'];

        if ($generatorOrganizationId === (int) $gestorOrganizationId) {
            throw ValidationException::withMessages([
                'generator_organization_id' => ['Una organización no puede registrarse a sí misma como su propio Generador cliente.'],
            ]);
        }

        $this->assertOrganizationCanGenerateWaste($generatorOrganizationId);
        $this->assertOrganizationCanTreatWaste((int) $gestorOrganizationId);

        $existing = GeneratorGestorRelationship::query()
            ->where('generator_organization_id', $generatorOrganizationId)
            ->where('gestor_organization_id', $gestorOrganizationId)
            ->first();

        if ($existing !== null && $existing->is_active) {
            throw ValidationException::withMessages([
                'generator_organization_id' => ['Ya existe una relación vigente con este Generador.'],
            ]);
        }

        $relationship = self::createOrReactivate($generatorOrganizationId, (int) $gestorOrganizationId, $actor, $data['observations'] ?? null, $data['metadata'] ?? null);

        $this->logSecurityEvent(
            $request, 'GENERATOR_GESTOR_RELATIONSHIP_CREATED', 'SUCCESS',
            "Generador (organización #{$generatorOrganizationId}) registrado como cliente del Gestor #{$gestorOrganizationId}.", $actor,
            ['generator_gestor_relationship_id' => $relationship->id, 'generator_organization_id' => $generatorOrganizationId, 'gestor_organization_id' => $gestorOrganizationId],
        );

        return response()->json(['generator_gestor_relationship' => $relationship->fresh(['generatorOrganization:id,legal_name', 'gestorOrganization:id,legal_name'])], 201);
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
     * `generator_gestor_relationships.read` (hallazgo de
     * `especialista-seguridad`, 2026-08-12 -- ver
     * `GeneratorRelationshipCreatedNotification`) cada vez que el vínculo
     * pasa de no-vigente a vigente (creación o reactivación) -- NO se
     * reenvía en el caso idempotente de arriba (par ya vigente), para no
     * reenviar el mismo aviso en cada recarga de un CSV.
     */
    public static function createOrReactivate(int $generatorOrganizationId, int $gestorOrganizationId, \App\Models\User $actor, ?string $observations = null, ?array $metadata = null): GeneratorGestorRelationship
    {
        $existing = GeneratorGestorRelationship::query()
            ->where('generator_organization_id', $generatorOrganizationId)
            ->where('gestor_organization_id', $gestorOrganizationId)
            ->first();

        if ($existing !== null && $existing->is_active) {
            return $existing;
        }

        $relationship = $existing ?? new GeneratorGestorRelationship;
        $relationship->fill([
            'generator_organization_id' => $generatorOrganizationId,
            'gestor_organization_id' => $gestorOrganizationId,
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

        $gestorOrganization = Organization::query()->find($gestorOrganizationId);
        $recipients = \App\Models\User::activeUsersInOrganizationWithPermission($generatorOrganizationId, 'generator_gestor_relationships.read');
        $reachableRecipients = $recipients->reject(fn ($user) => UserProvisioningService::hasPlaceholderEmail($user));

        if ($gestorOrganization !== null && $reachableRecipients->isNotEmpty()) {
            Notification::send($reachableRecipients, new GeneratorRelationshipCreatedNotification($gestorOrganization, 'Gestor'));
        } elseif ($gestorOrganization !== null && $recipients->isNotEmpty()) {
            // Respaldo (decisión del usuario, 2026-08-13): los ÚNICOS
            // destinatarios resueltos tienen correo placeholder (típico de un
            // Generador recién autoprovisionado por Carga Masiva, ver
            // `UserProvisioningService::createActiveAdminForOrganization()`)
            // -- se cae al correo de la ORGANIZACIÓN (ahora obligatorio al
            // crearla, ver `GeneratorBulkImportService::assertOrganizationEmailProvided()`/
            // `OrganizationController::validationRules()`), vía notificación
            // "on-demand" (sin `User` de por medio). Si tampoco hay
            // `email` de organización (dato legado, de antes de esta
            // decisión), no se envía nada -- no hay a dónde.
            $generatorOrganization = Organization::query()->find($generatorOrganizationId);

            if ($generatorOrganization?->email !== null) {
                Notification::route('mail', $generatorOrganization->email)
                    ->notify(new GeneratorRelationshipCreatedNotification($gestorOrganization, 'Gestor'));
            }
        }

        return $relationship;
    }

    /**
     * Solo el Gestor dueño puede revocar. NO borra el registro -- lo marca
     * `is_active=false`, mismo criterio que
     * `GeneratorSubgestorRelationship::revoke()`.
     */
    public function revoke(Request $request, GeneratorGestorRelationship $relationship)
    {
        $actor = $request->user();
        abort_unless((new GeneratorGestorRelationshipPolicy)->revoke($actor, $relationship), 403, 'No tiene acceso a esta relación Generador-Gestor.');

        if (! $relationship->is_active) {
            throw ValidationException::withMessages([
                'generator_gestor_relationship' => ['Esta relación ya está revocada.'],
            ]);
        }

        $relationship->forceFill([
            'is_active' => false,
            'revoked_by' => $actor->id,
            'revoked_at' => now(),
            'updated_by' => $actor->id,
        ])->save();

        $this->logSecurityEvent(
            $request, 'GENERATOR_GESTOR_RELATIONSHIP_REVOKED', 'SUCCESS',
            "Relación con el Generador (organización #{$relationship->generator_organization_id}) revocada por el Gestor #{$relationship->gestor_organization_id}.", $actor,
            ['generator_gestor_relationship_id' => $relationship->id],
        );

        return response()->json(['generator_gestor_relationship' => $relationship->fresh(['generatorOrganization:id,legal_name', 'gestorOrganization:id,legal_name'])]);
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

    private function assertOrganizationCanTreatWaste(int $organizationId): void
    {
        $organization = Organization::query()->find($organizationId);

        if (! $organization || ! $organization->hasCapability('can_treat_waste')) {
            throw ValidationException::withMessages([
                'gestor_organization_id' => ['Solo organizaciones con capacidad de tratamiento pueden registrar Generadores clientes directos.'],
            ]);
        }
    }
}
