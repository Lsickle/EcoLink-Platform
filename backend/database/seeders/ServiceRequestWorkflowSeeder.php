<?php

namespace Database\Seeders;

use App\Models\BusinessRole;
use App\Models\Role;
use App\Models\Workflow;
use App\Models\WorkflowEntityBinding;
use App\Models\WorkflowTransition;
use App\Models\WorkflowTransitionRole;
use App\Models\WorkflowVersion;
use Illuminate\Database\Seeder;

/**
 * Workflow BASE "Solicitud de Servicio" (motor de Workflow genérico,
 * D-WF-01, `entity_type=SERVICE`, `tenant_organization_id=NULL`,
 * `is_system=true`) -- ciclo real de `service_statuses` (D-S02/D-S13/D-S23),
 * mismo patrón exacto que `WorkflowSeeder` (RESPEL).
 *
 * Grafo (9 estados, D-S02):
 *   DRAFT -> SUBMITTED -> UNDER_REVIEW -> APPROVED|REJECTED
 *   APPROVED -> SCHEDULED -> IN_EXECUTION -> COMPLETED
 *   CANCELLED alcanzable desde todos los estados NO-finales
 *   (DRAFT/SUBMITTED/UNDER_REVIEW/APPROVED/SCHEDULED/IN_EXECUTION)
 *   REJECTED -> DRAFT (reapertura, D-S23)
 *
 * Roles (D-S25, Matriz CRUD §3 desglosada):
 *   - DRAFT -> SUBMITTED: SOLO business_role GENERATOR ("Regla nueva: solo
 *     GENERATOR puede transicionar Borrador->Enviada -- si COMERCIAL crea la
 *     solicitud en su nombre, queda en Borrador hasta que el propio
 *     Generador la envíe").
 *   - SUBMITTED -> UNDER_REVIEW: automática (`is_automatic=true`), sin
 *     actor -- D-S13 no asigna un rol que "inicie" la revisión, es el
 *     ingreso a la cola de revisión del Gestor/Subgestor/Transportador.
 *   - UNDER_REVIEW -> APPROVED/REJECTED: business_role GESTOR ("quien
 *     aprueba/rechaza (cabecera o por ítem) es GESTOR" -- D-S25; la regla de
 *     AGREGADO cabecera<->ítems de D-S01 vive en la futura capa de
 *     orquestación, D-S27, no en este workflow genérico).
 *   - Cancelación (desde cualquier estado no-final) -> CANCELLED:
 *     business_role GENERATOR ("GENERATOR tiene control total sobre la
 *     cancelación (CU-016) -- no requiere confirmación de ningún otro rol").
 *   - REJECTED -> DRAFT (reapertura, D-S23): business_role GENERATOR
 *     (INFERENCIA de este lote, NO confirmada explícitamente por D-S23 --
 *     el Generador es quien posee el borrador a reabrir; señalado en el
 *     resumen de la tarea), `requires_approval=true` (mismo patrón D-WF-05
 *     ya usado en WorkflowSeeder para salidas desde un estado terminal).
 *   - APPROVED -> SCHEDULED, SCHEDULED -> IN_EXECUTION,
 *     IN_EXECUTION -> COMPLETED: PLACEHOLDER `role_id=ADMINISTRADOR` --
 *     estas transiciones pertenecen operativamente al futuro módulo de
 *     Programación/Dispatch (Fase 2 del plan de 5 fases, fuera de alcance de
 *     esta tarea) y ningún D-S de Solicitudes asigna su actor real. Se
 *     modelan aquí solo para que el GRAFO esté completo (los 9 estados
 *     conectados), NO como una decisión de RBAC definitiva -- debe
 *     reemplazarse cuando se audite ese módulo. Señalado explícitamente en
 *     el resumen de la tarea.
 *
 * Sin `workflow_transition_rules` en este lote -- mismo criterio que
 * WorkflowSeeder (RESPEL): no hay validaciones adicionales más allá de las
 * ya cubiertas por el catálogo de estados/reglas de aplicación documentadas
 * en D-S06/D-S07/D-S20 (verificaciones síncronas al enviar, no reglas de
 * workflow configurables).
 */
class ServiceRequestWorkflowSeeder extends Seeder
{
    private const NON_FINAL_STATUSES = [
        'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'SCHEDULED', 'IN_EXECUTION',
    ];

    public function run(): void
    {
        $generator = BusinessRole::query()->where('code', 'GENERATOR')->firstOrFail();
        $gestor = BusinessRole::query()->where('code', 'GESTOR')->firstOrFail();
        $administrador = Role::query()->where('code', 'ADMINISTRADOR')->firstOrFail();

        $workflow = Workflow::query()->updateOrCreate(
            ['tenant_organization_id' => null, 'code' => 'SERVICE_REQUEST'],
            [
                'name' => 'Solicitud de Servicio',
                'description' => 'Workflow base del ciclo de vida de waste_service_requests (D-S02/D-S13/D-S23).',
                'entity_type' => Workflow::ENTITY_TYPES[1], // SERVICE
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

        // Transición principal Borrador -> Enviada: solo GENERATOR.
        $this->createTransition($version->id, 'DRAFT', 'SUBMITTED', businessRoleId: $generator->id);

        // Enviada -> En Revisión: automática, sin actor.
        $this->createTransition($version->id, 'SUBMITTED', 'UNDER_REVIEW', isAutomatic: true);

        // En Revisión -> Aprobada/Rechazada: GESTOR (cabecera, D-S25).
        $this->createTransition($version->id, 'UNDER_REVIEW', 'APPROVED', businessRoleId: $gestor->id);
        $this->createTransition($version->id, 'UNDER_REVIEW', 'REJECTED', businessRoleId: $gestor->id);

        // Reapertura Rechazada -> Borrador (D-S23) -- inferencia de rol, ver docblock.
        $this->createTransition($version->id, 'REJECTED', 'DRAFT', businessRoleId: $generator->id, requiresApproval: true);

        // Placeholder de Programación/Dispatch (fuera de alcance, ver docblock).
        $this->createTransition($version->id, 'APPROVED', 'SCHEDULED', roleId: $administrador->id);
        $this->createTransition($version->id, 'SCHEDULED', 'IN_EXECUTION', roleId: $administrador->id);
        $this->createTransition($version->id, 'IN_EXECUTION', 'COMPLETED', roleId: $administrador->id);

        // Cancelación desde cualquier estado no-final -- control total del GENERATOR.
        foreach (self::NON_FINAL_STATUSES as $fromStatus) {
            $this->createTransition($version->id, $fromStatus, 'CANCELLED', businessRoleId: $generator->id);
        }

        WorkflowEntityBinding::query()->updateOrCreate(
            ['entity_table' => 'waste_service_requests', 'status_column' => 'service_status_id'],
            ['workflow_id' => $workflow->id, 'status_catalog_table' => 'service_statuses'],
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
