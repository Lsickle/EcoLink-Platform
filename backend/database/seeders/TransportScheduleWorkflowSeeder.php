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
 * Workflow BASE "Programación de Transporte" (motor de Workflow genérico,
 * D-WF-01, `entity_type=SCHEDULING`, `tenant_organization_id=NULL`,
 * `is_system=true`) -- mismo patrón exacto que `WorkflowSeeder` (RESPEL) y
 * `ServiceRequestWorkflowSeeder` (SERVICE_REQUEST). Módulo Programación
 * Logística (D-PRG-01 a D-PRG-14).
 *
 * Grafo (7 estados, `TransportStatusSeeder`, confirmado en vivo contra
 * Figma):
 *   BOR -> PEND -> PROG -> CONF -> EJEC -> FIN
 *   CANC alcanzable desde BOR/PEND/PROG/CONF (estados NO operativos --
 *   una vez que el transporte está EJEC/FIN, esta transición ya no aplica,
 *   inferencia de este lote: ningún D-PRG resuelve explícitamente si EJEC
 *   admite cancelación, se sigue el mismo criterio que RN-097/098 exigen
 *   vehículo/conductor asignado sin excepción -- cancelar un viaje ya en
 *   curso pertenece al futuro módulo de Transporte/ejecución, CU-035-037,
 *   no a Programación Logística).
 *
 * Roles:
 *   - BOR -> PEND, PEND -> PROG, PROG -> CONF: `Role` de sistema
 *     `LOGÍSTICA` (D-PRG-14: "Coordinador Logístico" -> eje 1 LOGÍSTICA,
 *     confianza Media). D-PRG-14 también resuelve que el Generador
 *     ejecutando autotransporte (Modalidad 2) NO es una fila distinta de
 *     RBAC -- es un usuario con el MISMO rol de sistema LOGÍSTICA,
 *     perteneciente a una organización GENERATOR que además adquiere
 *     `business_role TRANSPORTER` (D-PRG-04). Por eso todas las
 *     transiciones de autoría humana de este workflow usan el mismo
 *     `role_id=LOGÍSTICA`, sin necesidad de una segunda entrada por
 *     modalidad.
 *   - CONF -> EJEC, EJEC -> FIN: PLACEHOLDER `role_id=ADMINISTRADOR` --
 *     mismo criterio EXACTO que `ServiceRequestWorkflowSeeder` (transiciones
 *     `APPROVED -> SCHEDULED -> IN_EXECUTION -> COMPLETED`): pertenecen
 *     operativamente al futuro módulo de Transporte/Ejecución (CU-035-037,
 *     fuera de alcance de esta tarea) y ningún D-PRG asigna su actor real.
 *     Se modelan aquí solo para que el GRAFO esté completo, NO como
 *     decisión de RBAC definitiva -- señalado explícitamente en el resumen
 *     de la tarea.
 *   - BOR/PEND/PROG/CONF -> CANC: `Role` LOGÍSTICA (CU-028 "Cancelar
 *     Programación" -- mismo actor que programa).
 *
 * Sin `workflow_transition_rules` en este lote -- mismo criterio que los
 * otros 2 workflows base (RESPEL/SERVICE_REQUEST): sin controller todavía
 * que exija validaciones adicionales (esta tarea es Fase 2a, solo esquema).
 */
class TransportScheduleWorkflowSeeder extends Seeder
{
    private const NON_OPERATIONAL_STATUSES = ['BOR', 'PEND', 'PROG', 'CONF'];

    public function run(): void
    {
        $logistica = Role::query()->where('code', 'LOGÍSTICA')->firstOrFail();
        $administrador = Role::query()->where('code', 'ADMINISTRADOR')->firstOrFail();

        $workflow = Workflow::query()->updateOrCreate(
            ['tenant_organization_id' => null, 'code' => 'TRANSPORT_SCHEDULE'],
            [
                'name' => 'Programación de Transporte',
                'description' => 'Workflow base del ciclo de vida de transport_schedules (D-PRG-01 a D-PRG-14).',
                'entity_type' => Workflow::ENTITY_TYPES[10], // SCHEDULING
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

        // Grafo principal, autoría humana LOGÍSTICA (Coordinador Logístico o
        // Generador+TRANSPORTER en autotransporte, D-PRG-14).
        $this->createTransition($version->id, 'BOR', 'PEND', roleId: $logistica->id);
        $this->createTransition($version->id, 'PEND', 'PROG', roleId: $logistica->id);
        $this->createTransition($version->id, 'PROG', 'CONF', roleId: $logistica->id);

        // Placeholder de ejecución de transporte (fuera de alcance, ver docblock).
        $this->createTransition($version->id, 'CONF', 'EJEC', roleId: $administrador->id);
        $this->createTransition($version->id, 'EJEC', 'FIN', roleId: $administrador->id);

        // Cancelación (CU-028) -- desde cualquier estado no-operativo.
        foreach (self::NON_OPERATIONAL_STATUSES as $fromStatus) {
            $this->createTransition($version->id, $fromStatus, 'CANC', roleId: $logistica->id);
        }

        WorkflowEntityBinding::query()->updateOrCreate(
            ['entity_table' => 'transport_schedules', 'status_column' => 'transport_status_id'],
            ['workflow_id' => $workflow->id, 'status_catalog_table' => 'transport_statuses'],
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
