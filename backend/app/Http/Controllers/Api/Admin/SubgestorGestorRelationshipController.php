<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Concerns\LogsSecurityEvents;
use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\SubgestorGestorRelationship;
use App\Policies\SubgestorGestorRelationshipPolicy;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Vínculo comercial Subgestor -> Gestor (Fase 2 del ciclo de vida del residuo,
 * 2026-08-15). Ver docblock de la migración
 * create_subgestor_gestor_relationships_table.
 *
 * Acota a qué Gestores puede delegarle una asignación de tratamiento cada
 * Subgestor (`WasteTreatmentApprovalController::storeDelegatedForWaste()`).
 *
 * Mismo patrón que `GeneratorGestorRelationshipController`, con dos
 * diferencias deliberadas:
 *
 *  - Aquí gestiona el SUBGESTOR, no el Gestor: un Gestor DE REFERENCIA no
 *    tiene usuarios en la plataforma y no podría autorizar nada.
 *  - `store()` RECHAZA un par ya vigente (422) en vez de ser idempotente:
 *    aquí no hay carga masiva que recargue el mismo CSV, así que un duplicado
 *    es un error del llamador y conviene decirlo.
 */
class SubgestorGestorRelationshipController extends Controller
{
    use LogsSecurityEvents;

    public function index(Request $request)
    {
        $actor = $request->user();
        abort_unless((new SubgestorGestorRelationshipPolicy)->viewAny($actor), 403, 'No tiene permiso para consultar relaciones Subgestor-Gestor.');

        $relationships = SubgestorGestorRelationship::query()
            ->when(! $actor->isPlatformStaff(), function ($query) use ($actor) {
                $query->where(function ($query) use ($actor) {
                    $query->where('subgestor_organization_id', $actor->tenant_organization_id)
                        ->orWhere('gestor_organization_id', $actor->tenant_organization_id);
                });
            })
            ->when($request->boolean('active_only'), fn ($query) => $query->where('is_active', true))
            ->with(['subgestorOrganization:id,legal_name', 'gestorOrganization:id,legal_name'])
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 15));

        return response()->json($relationships);
    }

    public function show(Request $request, SubgestorGestorRelationship $relationship)
    {
        abort_unless((new SubgestorGestorRelationshipPolicy)->view($request->user(), $relationship), 403, 'No tiene acceso a esta relación Subgestor-Gestor.');

        $relationship->load(['subgestorOrganization:id,legal_name', 'gestorOrganization:id,legal_name', 'authorizedBy:id,username', 'revokedBy:id,username']);

        return response()->json(['subgestor_gestor_relationship' => $relationship]);
    }

    public function store(Request $request)
    {
        $actor = $request->user();

        // Anti-role-smuggling, mismo criterio que las otras dos relaciones
        // comerciales: un tenant admin SIEMPRE registra desde SU PROPIA
        // organización.
        $subgestorOrganizationId = $actor->isPlatformStaff()
            ? $request->integer('subgestor_organization_id')
            : $actor->tenant_organization_id;

        abort_unless((new SubgestorGestorRelationshipPolicy)->create($actor, $subgestorOrganizationId), 403, 'No tiene permiso para vincular Gestores.');

        $rules = [
            'gestor_organization_id' => ['required', 'integer', 'exists:organizations,id'],
            'observations' => ['sometimes', 'nullable', 'string'],
            'metadata' => ['sometimes', 'nullable', 'array'],
        ];

        if ($actor->isPlatformStaff()) {
            $rules['subgestor_organization_id'] = ['required', 'integer', 'exists:organizations,id'];
        }

        $data = $request->validate($rules);
        $gestorOrganizationId = (int) $data['gestor_organization_id'];

        if ($gestorOrganizationId === (int) $subgestorOrganizationId) {
            throw ValidationException::withMessages([
                'gestor_organization_id' => ['Una organización no puede vincularse a sí misma como su propio Gestor.'],
            ]);
        }

        $this->assertOrganizationCanTreatWaste($gestorOrganizationId);
        $this->assertOrganizationCanTransportWaste((int) $subgestorOrganizationId);

        $existing = SubgestorGestorRelationship::query()
            ->where('subgestor_organization_id', $subgestorOrganizationId)
            ->where('gestor_organization_id', $gestorOrganizationId)
            ->first();

        if ($existing !== null && $existing->is_active) {
            throw ValidationException::withMessages([
                'gestor_organization_id' => ['Ya existe un vínculo vigente con este Gestor.'],
            ]);
        }

        // Reactiva in-place si estaba revocado -- nunca se crea una segunda
        // fila para el mismo par (lo impediría el índice único parcial).
        $relationship = $existing ?? new SubgestorGestorRelationship;
        $relationship->fill([
            'subgestor_organization_id' => $subgestorOrganizationId,
            'gestor_organization_id' => $gestorOrganizationId,
            'observations' => $data['observations'] ?? null,
            'metadata' => $data['metadata'] ?? null,
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

        $this->logSecurityEvent(
            $request, 'SUBGESTOR_GESTOR_RELATIONSHIP_CREATED', 'SUCCESS',
            "Gestor (organización #{$gestorOrganizationId}) vinculado al Subgestor #{$subgestorOrganizationId}.", $actor,
            ['subgestor_gestor_relationship_id' => $relationship->id, 'subgestor_organization_id' => $subgestorOrganizationId, 'gestor_organization_id' => $gestorOrganizationId],
        );

        return response()->json(['subgestor_gestor_relationship' => $relationship->fresh(['subgestorOrganization:id,legal_name', 'gestorOrganization:id,legal_name'])], 201);
    }

    /**
     * NO borra el registro -- lo marca `is_active=false`, mismo criterio que
     * las otras dos relaciones comerciales. Las evaluaciones ya registradas
     * bajo este vínculo NO se ven afectadas: conservan su
     * `delegated_by_organization_id` y su trazabilidad.
     */
    public function revoke(Request $request, SubgestorGestorRelationship $relationship)
    {
        $actor = $request->user();
        abort_unless((new SubgestorGestorRelationshipPolicy)->revoke($actor, $relationship), 403, 'No tiene acceso a esta relación Subgestor-Gestor.');

        if (! $relationship->is_active) {
            throw ValidationException::withMessages([
                'subgestor_gestor_relationship' => ['Este vínculo ya está revocado.'],
            ]);
        }

        $relationship->forceFill([
            'is_active' => false,
            'revoked_by' => $actor->id,
            'revoked_at' => now(),
            'updated_by' => $actor->id,
        ])->save();

        $this->logSecurityEvent(
            $request, 'SUBGESTOR_GESTOR_RELATIONSHIP_REVOKED', 'SUCCESS',
            "Vínculo con el Gestor (organización #{$relationship->gestor_organization_id}) revocado por el Subgestor #{$relationship->subgestor_organization_id}.", $actor,
            ['subgestor_gestor_relationship_id' => $relationship->id],
        );

        return response()->json(['subgestor_gestor_relationship' => $relationship->fresh(['subgestorOrganization:id,legal_name', 'gestorOrganization:id,legal_name'])]);
    }

    /**
     * Un Subgestor se identifica por `can_transport_waste` -- misma convencion
     * que `GeneratorSubgestorRelationshipController::assertOrganizationCanTransportWaste()`.
     */
    private function assertOrganizationCanTransportWaste(int $organizationId): void
    {
        $organization = Organization::query()->find($organizationId);

        if (! $organization || ! $organization->hasCapability('can_transport_waste')) {
            throw ValidationException::withMessages([
                'subgestor_organization_id' => ['Solo organizaciones con capacidad de transporte pueden vincular Gestores.'],
            ]);
        }
    }

    private function assertOrganizationCanTreatWaste(int $organizationId): void
    {
        $organization = Organization::query()->find($organizationId);

        if (! $organization || ! $organization->hasCapability('can_treat_waste')) {
            throw ValidationException::withMessages([
                'gestor_organization_id' => ['Solo organizaciones con capacidad de tratamiento pueden vincularse como Gestor.'],
            ]);
        }
    }
}
