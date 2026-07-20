<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\Workflow;
use App\Models\WorkflowEntityBinding;
use App\Models\WorkflowTransition;
use App\Models\WorkflowTransitionRole;
use App\Models\WorkflowVersion;
use Illuminate\Database\Seeder;

/**
 * Workflow BASE "Solicitud de Descargue" (motor de Workflow genérico,
 * D-WF-01, `tenant_organization_id=NULL`, `is_system=true`) -- Fase 4 "Cita
 * de Recepción en Planta (bilateral)". Mismo patrón exacto que
 * `TransportScheduleWorkflowSeeder`/`ManifestLoadWorkflowSeeder`, pero MUCHO
 * más simple (sin agregado por ítems, mismo espíritu que
 * `ServiceRequestWorkflowSeeder`).
 *
 * DECISIÓN de `entity_type` (a decidir y justificar por esta tarea):
 * `TRANSPORT` (`Workflow::ENTITY_TYPES[2]`), NO `SCHEDULING` (que ya usa en
 * exclusiva `transport_schedules`, ver `TransportScheduleWorkflowSeeder`).
 * Razón ESTRUCTURAL, no solo semántica: `Workflow::resolveFor(entityType,
 * organizationId)` resuelve el workflow BASE de sistema filtrando SOLO por
 * `entity_type` (`whereNull('tenant_organization_id')->where('is_system',
 * true)->first()`) -- NO por `entity_table`. Si `unload_requests` reusara
 * `entity_type=SCHEDULING`, `Workflow::resolveFor('SCHEDULING', ...)`
 * devolvería el MISMO registro de workflow que ya usa `TransportSchedule`
 * (`TRANSPORT_SCHEDULE`, códigos BOR/PEND/PROG/CONF/EJEC/FIN/CANC) --
 * `UnloadRequestWorkflowService` intentaría resolver una transición
 * `DRAFT->SUBMITTED` dentro de ESE workflow y jamás la encontraría (422
 * permanente), y de paso quedaría indefinido cuál de los 2 `is_system=true`
 * workflows con el mismo `entity_type` gana la resolución si alguna vez
 * hubiera más de uno. Usar `TRANSPORT` (hoy sin ningún otro workflow
 * registrado) evita esta colisión de raíz.
 *
 * Grafo (4 estados, `UnloadRequestStatusSeeder`):
 *   DRAFT -> SUBMITTED -> APPROVED
 *                      -> REJECTED
 *
 * Roles: LOGÍSTICA para las 3 transiciones humanas -- mismo criterio EXACTO
 * que `TransportScheduleWorkflowSeeder`/`ManifestLoadWorkflowSeeder`: el
 * motor solo autoriza por ROL de sistema, la restricción fina de "cuál
 * ORGANIZACIÓN concreta" (transportador vs. receptor) vive en
 * `UnloadRequestPolicy`/`UnloadRequestController` (mismo patrón de capas que
 * `ManifestLoadPolicy::manage()` frente a `ManifestLoadWorkflowService`).
 * FLAG explícito (mismo gap real ya señalado en
 * `RolePermissionSeeder::LOGISTICA_PERMISSION_CODES`): el catálogo canónico
 * de 9 roles todavía solo tiene 2 sembrados (ADMINISTRADOR/LOGÍSTICA) -- no
 * existe un rol de sistema dedicado al lado Generador ni al Coordinador de
 * Recepción; hasta que se siembren, cualquier actor de cualquiera de los 2
 * lados debe tener asignado ADMINISTRADOR o LOGÍSTICA.
 *
 * Sin `workflow_transition_rules` en este lote -- mismo criterio que el
 * resto de workflows base ya sembrados.
 */
class UnloadRequestWorkflowSeeder extends Seeder
{
    public function run(): void
    {
        $logistica = Role::query()->where('code', 'LOGÍSTICA')->firstOrFail();

        $workflow = Workflow::query()->updateOrCreate(
            ['tenant_organization_id' => null, 'code' => 'UNLOAD_REQUEST'],
            [
                'name' => 'Solicitud de Descargue',
                'description' => 'Workflow base del ciclo de vida de unload_requests (Fase 4, "Cita de Recepción en Planta").',
                'entity_type' => Workflow::ENTITY_TYPES[2], // TRANSPORT
                'is_system' => true,
                'is_active' => true,
            ],
        );

        $version = WorkflowVersion::query()->firstOrCreate(
            ['workflow_id' => $workflow->id, 'version_number' => 1],
            ['status' => 'PUBLISHED', 'published_at' => now()],
        );

        if ($version->status !== 'PUBLISHED') {
            $version->forceFill(['status' => 'PUBLISHED', 'published_at' => $version->published_at ?? now()])->save();
        }

        if ($workflow->current_version_id !== $version->id) {
            $workflow->forceFill(['current_version_id' => $version->id])->save();
        }

        $this->createTransition($version->id, 'DRAFT', 'SUBMITTED', roleId: $logistica->id);
        $this->createTransition($version->id, 'SUBMITTED', 'APPROVED', roleId: $logistica->id);
        $this->createTransition($version->id, 'SUBMITTED', 'REJECTED', roleId: $logistica->id);

        WorkflowEntityBinding::query()->updateOrCreate(
            ['entity_table' => 'unload_requests', 'status_column' => 'unload_request_status_id'],
            ['workflow_id' => $workflow->id, 'status_catalog_table' => 'unload_request_statuses'],
        );
    }

    private function createTransition(
        int $versionId,
        string $from,
        string $to,
        ?int $roleId = null,
        ?int $businessRoleId = null,
        bool $isAutomatic = false,
        bool $requiresApproval = false,
    ): void {
        $transition = WorkflowTransition::query()->updateOrCreate(
            ['workflow_version_id' => $versionId, 'from_status_code' => $from, 'to_status_code' => $to],
            ['is_automatic' => $isAutomatic, 'requires_approval' => $requiresApproval],
        );

        if ($roleId !== null || $businessRoleId !== null) {
            WorkflowTransitionRole::query()->firstOrCreate([
                'workflow_transition_id' => $transition->id,
                'role_id' => $roleId,
                'business_role_id' => $businessRoleId,
            ]);
        }
    }
}
