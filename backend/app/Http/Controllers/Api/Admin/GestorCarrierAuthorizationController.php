<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Concerns\LogsSecurityEvents;
use App\Http\Controllers\Controller;
use App\Models\GestorCarrierAuthorization;
use App\Models\Organization;
use App\Policies\GestorCarrierAuthorizationPolicy;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Módulo Programación Logística, Fase 4 -- "Modalidad 3": un Transportador
 * INDEPENDIENTE (organización propia, NO el Gestor) contratado para mover
 * residuos de un Gestor. Ver docblock de la migración
 * create_gestor_carrier_authorizations_table para el detalle completo de las
 * decisiones aplicadas (mismo patrón que `organization_cartera_statuses`,
 * D-S04/D-S12).
 *
 * Un solo registro VIGENTE por par (gestor, transportador) -- `store()` crea
 * el par si no existe, o REACTIVA (in-place) el registro existente si estaba
 * revocado (mismo criterio "se actualiza in-place" de D-S12, historial vía
 * `audit_logs`, sin filas duplicadas por par). Rechaza con 422 si YA existe
 * un registro VIGENTE para ese par (evita duplicar la autorización activa,
 * la app valida esto explícitamente además del índice único parcial de la
 * migración, que solo actúa como red de seguridad ante condiciones de
 * carrera).
 *
 * `TransportScheduleController::resolveAndValidateItems()` consume este
 * registro (además del caso ya existente `organizationId === gestorId`) para
 * decidir si un Transportador puede programar transporte sobre ítems
 * aprobados por un Gestor con el que NO comparte organización.
 */
class GestorCarrierAuthorizationController extends Controller
{
    use LogsSecurityEvents;

    public function index(Request $request)
    {
        $actor = $request->user();
        abort_unless((new GestorCarrierAuthorizationPolicy)->viewAny($actor), 403, 'No tiene permiso para consultar autorizaciones de transportador.');

        $authorizations = GestorCarrierAuthorization::query()
            ->when(! $actor->isPlatformStaff(), function ($query) use ($actor) {
                $query->where(function ($query) use ($actor) {
                    $query->where('gestor_organization_id', $actor->tenant_organization_id)
                        ->orWhere('carrier_organization_id', $actor->tenant_organization_id);
                });
            })
            ->when($request->boolean('active_only'), fn ($query) => $query->where('is_active', true))
            ->with(['gestorOrganization:id,legal_name', 'carrierOrganization:id,legal_name'])
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 15));

        return response()->json($authorizations);
    }

    public function show(Request $request, GestorCarrierAuthorization $authorization)
    {
        abort_unless((new GestorCarrierAuthorizationPolicy)->view($request->user(), $authorization), 403, 'No tiene acceso a esta autorización de transportador.');

        $authorization->load(['gestorOrganization:id,legal_name', 'carrierOrganization:id,legal_name', 'authorizedBy:id,username', 'revokedBy:id,username']);

        return response()->json(['gestor_carrier_authorization' => $authorization]);
    }

    /**
     * Solo el Gestor DUEÑO de `gestor_organization_id` puede autorizar. Anti-
     * IDOR: `carrier_organization_id` debe pertenecer a una organización REAL
     * con `can_transport_waste=true` (mismo chequeo ya usado por
     * `TransportSchedulePolicy::create()`/`TransportScheduleController::assertOrganizationCanTransportWaste()`).
     */
    public function store(Request $request)
    {
        $actor = $request->user();

        // Anti-role-smuggling (mismo criterio que TransportScheduleController::store()):
        // un tenant admin SIEMPRE autoriza desde SU PROPIA organización.
        $gestorOrganizationId = $actor->isPlatformStaff()
            ? $request->integer('gestor_organization_id')
            : $actor->tenant_organization_id;

        abort_unless((new GestorCarrierAuthorizationPolicy)->create($actor, $gestorOrganizationId), 403, 'No tiene permiso para autorizar transportadores.');

        $rules = [
            'carrier_organization_id' => ['required', 'integer', 'exists:organizations,id'],
            'observations' => ['sometimes', 'nullable', 'string'],
            'metadata' => ['sometimes', 'nullable', 'array'],
        ];

        if ($actor->isPlatformStaff()) {
            $rules['gestor_organization_id'] = ['required', 'integer', 'exists:organizations,id'];
        }

        $data = $request->validate($rules);
        $carrierOrganizationId = (int) $data['carrier_organization_id'];

        if ($carrierOrganizationId === (int) $gestorOrganizationId) {
            throw ValidationException::withMessages([
                'carrier_organization_id' => ['Un Gestor no puede autorizarse a sí mismo como transportador -- para transporte propio use la Modalidad 1, sin necesidad de esta autorización.'],
            ]);
        }

        $this->assertOrganizationCanTransportWaste($carrierOrganizationId);

        $existing = GestorCarrierAuthorization::query()
            ->where('gestor_organization_id', $gestorOrganizationId)
            ->where('carrier_organization_id', $carrierOrganizationId)
            ->first();

        if ($existing !== null && $existing->is_active) {
            throw ValidationException::withMessages([
                'carrier_organization_id' => ['Ya existe una autorización vigente para este transportador.'],
            ]);
        }

        $authorization = $existing ?? new GestorCarrierAuthorization;
        $authorization->fill([
            'gestor_organization_id' => $gestorOrganizationId,
            'carrier_organization_id' => $carrierOrganizationId,
            'observations' => $data['observations'] ?? null,
            'metadata' => $data['metadata'] ?? null,
        ]);
        $authorization->forceFill([
            'is_active' => true,
            'authorized_by' => $actor->id,
            'authorized_at' => now(),
            'revoked_by' => null,
            'revoked_at' => null,
            'created_by' => $authorization->exists ? $authorization->created_by : $actor->id,
            'updated_by' => $actor->id,
        ]);
        $authorization->save();

        $this->logSecurityEvent(
            $request, 'GESTOR_CARRIER_AUTHORIZATION_CREATED', 'SUCCESS',
            "Transportador (organización #{$carrierOrganizationId}) autorizado por el Gestor #{$gestorOrganizationId}.", $actor,
            ['gestor_carrier_authorization_id' => $authorization->id, 'gestor_organization_id' => $gestorOrganizationId, 'carrier_organization_id' => $carrierOrganizationId],
        );

        return response()->json(['gestor_carrier_authorization' => $authorization->fresh(['gestorOrganization:id,legal_name', 'carrierOrganization:id,legal_name'])], 201);
    }

    /**
     * Solo el Gestor dueño puede revocar. NO borra el registro (soft-delete
     * ni físico) -- lo marca `is_active=false`, mismo criterio que
     * `blocked_at`/`unblocked_at` de `organization_cartera_statuses`.
     * Programaciones YA CREADAS bajo esta autorización NO se ven afectadas
     * (decisión de este lote, ver resumen final) -- solo bloquea
     * programaciones NUEVAS a partir de la revocación.
     */
    public function revoke(Request $request, GestorCarrierAuthorization $authorization)
    {
        $actor = $request->user();
        abort_unless((new GestorCarrierAuthorizationPolicy)->revoke($actor, $authorization), 403, 'No tiene acceso a esta autorización de transportador.');

        if (! $authorization->is_active) {
            throw ValidationException::withMessages([
                'gestor_carrier_authorization' => ['Esta autorización ya está revocada.'],
            ]);
        }

        $authorization->forceFill([
            'is_active' => false,
            'revoked_by' => $actor->id,
            'revoked_at' => now(),
            'updated_by' => $actor->id,
        ])->save();

        $this->logSecurityEvent(
            $request, 'GESTOR_CARRIER_AUTHORIZATION_REVOKED', 'SUCCESS',
            "Autorización de transportador (organización #{$authorization->carrier_organization_id}) revocada por el Gestor #{$authorization->gestor_organization_id}.", $actor,
            ['gestor_carrier_authorization_id' => $authorization->id],
        );

        return response()->json(['gestor_carrier_authorization' => $authorization->fresh(['gestorOrganization:id,legal_name', 'carrierOrganization:id,legal_name'])]);
    }

    private function assertOrganizationCanTransportWaste(int $organizationId): void
    {
        $organization = Organization::query()->find($organizationId);

        if (! $organization || ! $organization->hasCapability('can_transport_waste')) {
            throw ValidationException::withMessages([
                'carrier_organization_id' => ['Solo organizaciones con capacidad de transporte pueden ser autorizadas como transportador.'],
            ]);
        }
    }
}
