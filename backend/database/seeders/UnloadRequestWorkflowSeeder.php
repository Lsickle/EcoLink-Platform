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
 * Roles -- REPARTO POR LADO (decisión del usuario, 2026-10-12: LOGÍSTICA =
 * lado transportador, OPERACIONES = lado planta receptora; CIERRA el FLAG
 * que este docblock arrastraba, "cualquier actor de cualquiera de los 2
 * lados debe tener asignado ADMINISTRADOR o LOGÍSTICA"):
 *   - DRAFT -> SUBMITTED ("submit()"): `LOGÍSTICA` -- la envía quien
 *     transporta (`UnloadRequestPolicy::manage()`, dueño de
 *     `carrier_organization_id`).
 *   - SUBMITTED -> APPROVED / REJECTED ("approve()"/"reject()"):
 *     `OPERACIONES` -- decide SOLO la planta receptora
 *     (`UnloadRequestPolicy::decide()`, dueña de `receiving_branch_id`).
 * El motor solo autoriza por ROL de sistema; la restricción fina de "cuál
 * ORGANIZACIÓN concreta" sigue en `UnloadRequestPolicy` y NO cambió (mismo
 * patrón de capas que `ManifestLoadPolicy::manage()` frente a
 * `ManifestLoadWorkflowService`). Sigue sin existir un rol de sistema
 * dedicado al lado Generador.
 *
 * Sin `workflow_transition_rules` en este lote -- mismo criterio que el
 * resto de workflows base ya sembrados.
 */
class UnloadRequestWorkflowSeeder extends Seeder
{
    public function run(): void
    {
        $logistica = Role::query()->where('code', 'LOGÍSTICA')->firstOrFail();
        $operaciones = Role::query()->where('code', 'OPERACIONES')->firstOrFail();

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

        // Lado transportador.
        $this->createTransition($version->id, 'DRAFT', 'SUBMITTED', roleId: $logistica->id);

        // Lado planta receptora -- hasta 2026-10-12 las autorizaba LOGÍSTICA.
        $this->createTransition($version->id, 'SUBMITTED', 'APPROVED', roleId: $operaciones->id, retiredRoleIds: [$logistica->id]);
        $this->createTransition($version->id, 'SUBMITTED', 'REJECTED', roleId: $operaciones->id, retiredRoleIds: [$logistica->id]);

        WorkflowEntityBinding::query()->updateOrCreate(
            ['entity_table' => 'unload_requests', 'status_column' => 'unload_request_status_id'],
            ['workflow_id' => $workflow->id, 'status_catalog_table' => 'unload_request_statuses'],
        );
    }

    /**
     * @param  list<int>  $retiredRoleIds  roles de sistema que una siembra anterior autorizaba en esta transición y ya no deben hacerlo
     */
    private function createTransition(
        int $versionId,
        string $from,
        string $to,
        ?int $roleId = null,
        ?int $businessRoleId = null,
        bool $isAutomatic = false,
        bool $requiresApproval = false,
        array $retiredRoleIds = [],
    ): void {
        $transition = WorkflowTransition::query()->updateOrCreate(
            ['workflow_version_id' => $versionId, 'from_status_code' => $from, 'to_status_code' => $to],
            ['is_automatic' => $isAutomatic, 'requires_approval' => $requiresApproval],
        );

        // Reparto por lado (2026-10-12): `firstOrCreate()` de abajo solo
        // AGREGA el rol nuevo; en una base ya sembrada (dev local/staging
        // corren `migrate --seed` sin `:fresh`) la fila del rol anterior
        // seguiría autorizando la transición. Se retira explícitamente --
        // `workflow_transition_roles` no tiene `is_active`/`deleted_at`, así
        // que aquí retirar ES borrar la fila. Solo los roles listados: no se
        // tocan otros que platform staff haya agregado a la transición.
        if ($retiredRoleIds !== []) {
            WorkflowTransitionRole::query()
                ->where('workflow_transition_id', $transition->id)
                ->whereIn('role_id', $retiredRoleIds)
                ->delete();
        }

        if ($roleId !== null || $businessRoleId !== null) {
            WorkflowTransitionRole::query()->firstOrCreate([
                'workflow_transition_id' => $transition->id,
                'role_id' => $roleId,
                'business_role_id' => $businessRoleId,
            ]);
        }
    }
}
