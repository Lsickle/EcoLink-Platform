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
 * Workflow BASE "RESPEL" (motor de Workflow genérico, D-WF-01/D-WF-02,
 * `entity_type=TREATMENT`, `tenant_organization_id=NULL`, `is_system=true`)
 * -- replica EXACTAMENTE las transiciones que
 * `WasteTreatmentApprovalController` permite HOY (ver docblock de
 * RespelStatusSeeder para el detalle completo de semántica por estado).
 *
 * Roles: el controller usa UN SOLO permiso (`treatment_approvals.evaluate`)
 * para las 4 transiciones de AMBOS ejes (técnico y comercial) --
 * `WasteTreatmentApprovalPolicy::evaluate()` no distingue entre eje técnico
 * y comercial, y `RolePermissionSeeder` solo asigna ese permiso al rol
 * `ADMINISTRADOR` (el único rol de negocio real sembrado con permisos de
 * escritura sobre este módulo hoy). Se replica ese comportamiento tal cual
 * -- TODAS las transiciones (técnicas y comerciales) quedan autorizadas
 * para `ADMINISTRADOR`, sin distinción de rol/cargo por eje (no existe esa
 * distinción en el código actual, y esta tarea no la inventa).
 *
 * `COM_APPROVED -> COM_CANCELLED` y `COM_REJECTED -> COM_CANCELLED`: el
 * controller permite cancelar (`cancel()`) incluso desde un estado
 * comercial FINAL (`TERMINAL_COMMERCIAL_STATUSES`) -- es la única
 * excepción de "reapertura desde estado final" del eje comercial (mismo
 * patrón documentado en D-WF-05 para RN-WF-005/007). Se modelan como
 * transiciones adicionales con `requires_approval=true` (mismo criterio
 * D-WF-05: salir de un estado final debe quedar marcado como una
 * transición de mayor exigencia, aunque hoy el controller no aplique un
 * paso de aprobación adicional -- documentado como diseño de este lote, no
 * como comportamiento ya verificado en el controller).
 *
 * Sin `workflow_transition_rules` en este lote -- el controller actual no
 * tiene validaciones de este tipo más allá de las ya cubiertas por el
 * catálogo de estados mismo (p. ej. "unit_price debe estar fijado antes de
 * aprobar comercialmente" vive hoy en el controller, no se migra a una
 * regla de workflow en esta tarea -- eso es parte del refactor,
 * explícitamente fuera de alcance).
 *
 * `workflow_entity_bindings`: 2 filas (`technical_status_id`/
 * `commercial_status_id`, ver `WorkflowEntityBinding` -- `UNIQUE(entity_table,
 * status_column)`, no `UNIQUE(entity_table)`, porque esta tabla necesita
 * DOS bindings simultáneos, uno por eje) -- sembradas en este lote, una vez
 * que esas columnas existen de verdad en `waste_treatment_approvals` (ver
 * migración `add_respel_status_ids_to_waste_treatment_approvals_table`).
 * Metadato informativo ("esta entidad/columna usa este workflow"); el
 * `WasteTreatmentApprovalController` resuelve el workflow directamente vía
 * `Workflow::resolveFor()`, no lee esta tabla.
 */
class WorkflowSeeder extends Seeder
{
    private const TECHNICAL_TRANSITIONS = [
        ['TECH_PENDING', 'TECH_APPROVED', false],
        ['TECH_PENDING', 'TECH_RESTRICTED', false],
        ['TECH_PENDING', 'TECH_REJECTED', false],
    ];

    private const COMMERCIAL_TRANSITIONS = [
        ['COM_DRAFT', 'COM_QUOTED', false],
        ['COM_DRAFT', 'COM_NEGOTIATING', false],
        ['COM_QUOTED', 'COM_NEGOTIATING', false],
        ['COM_DRAFT', 'COM_APPROVED', false],
        ['COM_QUOTED', 'COM_APPROVED', false],
        ['COM_NEGOTIATING', 'COM_APPROVED', false],
        ['COM_DRAFT', 'COM_REJECTED', false],
        ['COM_QUOTED', 'COM_REJECTED', false],
        ['COM_NEGOTIATING', 'COM_REJECTED', false],
        ['COM_DRAFT', 'COM_CANCELLED', false],
        ['COM_QUOTED', 'COM_CANCELLED', false],
        ['COM_NEGOTIATING', 'COM_CANCELLED', false],
        ['COM_APPROVED', 'COM_CANCELLED', true],
        ['COM_REJECTED', 'COM_CANCELLED', true],
    ];

    public function run(): void
    {
        $administrador = Role::query()->where('code', 'ADMINISTRADOR')->firstOrFail();

        $workflow = Workflow::query()->updateOrCreate(
            ['tenant_organization_id' => null, 'code' => 'RESPEL'],
            [
                'name' => 'Evaluación del Gestor (RESPEL)',
                'description' => 'Workflow base de los ejes técnico y comercial de waste_treatment_approvals -- replica las transiciones ya hardcodeadas en WasteTreatmentApprovalController.',
                'entity_type' => Workflow::ENTITY_TYPES[6], // TREATMENT
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

        foreach ([...self::TECHNICAL_TRANSITIONS, ...self::COMMERCIAL_TRANSITIONS] as [$from, $to, $requiresApproval]) {
            $transition = WorkflowTransition::query()->updateOrCreate(
                ['workflow_version_id' => $version->id, 'from_status_code' => $from, 'to_status_code' => $to],
                ['is_automatic' => false, 'requires_approval' => $requiresApproval],
            );

            WorkflowTransitionRole::query()->firstOrCreate([
                'workflow_transition_id' => $transition->id,
                'role_id' => $administrador->id,
                'business_role_id' => null,
            ]);
        }

        foreach (['technical_status_id', 'commercial_status_id'] as $statusColumn) {
            WorkflowEntityBinding::query()->updateOrCreate(
                ['entity_table' => 'waste_treatment_approvals', 'status_column' => $statusColumn],
                ['workflow_id' => $workflow->id, 'status_catalog_table' => 'respel_statuses'],
            );
        }
    }
}
