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
 * Workflow BASE "Manifiesto de Descargue" (motor de Workflow genérico,
 * D-WF-01, `entity_type=MANIFEST` -- MISMO `entity_type` que
 * `ManifestLoadWorkflowSeeder`, pero un workflow de sistema PROPIO
 * (`code='MANIFEST_UNLOAD'`), desambiguado en tiempo de resolución vía
 * `workflow_entity_bindings.entity_table='manifest_unloads'` (ver docblock
 * de `Workflow::resolveFor()`). Módulo Manifiesto de Descargue, Fase 5,
 * última fase del plan.
 *
 * Grafo (reutiliza el MISMO catálogo `manifest_statuses` de Fase 3, sin
 * catálogo nuevo -- `ManifestStatusSeeder`):
 *   Draft -> Generated -> PartiallySigned -> Signed -> Closed
 *   Cancelled alcanzable SOLO desde Generated/PartiallySigned (mismo
 *   criterio que `ManifestLoadWorkflowSeeder`).
 *
 * A DIFERENCIA de `manifest_loads` (que en su fase se detenía en
 * `InTransit`, dejando `Received`/`Closed` para esta fase): `manifest_unloads`
 * es el ÚLTIMO eslabón del ciclo -- SÍ cierra hasta `Closed`. Ninguna
 * transición se siembra hacia/desde `InTransit`/`Received` en este workflow
 * (esos códigos son vocabulario compartido del catálogo, propios del ciclo
 * de `manifest_loads`, no de este) -- el grafo salta directo de `Signed` a
 * `Closed` (`complete()`/`close()`).
 *
 * Roles:
 *   - Draft -> Generated ("generate()"), Signed -> Closed ("complete()"),
 *     Generated/PartiallySigned -> Cancelled ("cancel()"): `Role` de sistema
 *     `LOGÍSTICA` -- mismo criterio que `ManifestLoadWorkflowSeeder`: el
 *     receptor en planta del Gestor opera con los roles de sistema
 *     ADMINISTRADOR/LOGÍSTICA (no existe un rol de sistema dedicado a
 *     "recepción"), mismo precedente ya usado en Fases 3 y 4.
 *   - Generated -> PartiallySigned, PartiallySigned -> Signed: AUTOMÁTICAS
 *     (`is_automatic=true`), SIN `workflow_transition_roles` -- disparadas
 *     por `ManifestUnloadSignatureService::sign()`, que ya valida por su
 *     cuenta (anti-IDOR propio) quién puede firmar como receptor/conductor.
 *
 * Sin `workflow_transition_rules` en este lote -- mismo criterio que los
 * otros workflows base ya sembrados.
 */
class ManifestUnloadWorkflowSeeder extends Seeder
{
    private const CANCELLABLE_STATUSES = ['GENERATED', 'PARTIALLY_SIGNED'];

    public function run(): void
    {
        $logistica = Role::query()->where('code', 'LOGÍSTICA')->firstOrFail();

        $workflow = Workflow::query()->updateOrCreate(
            ['tenant_organization_id' => null, 'code' => 'MANIFEST_UNLOAD'],
            [
                'name' => 'Manifiesto de Descargue',
                'description' => 'Workflow base del ciclo de vida de manifest_unloads (Fase 5, "Manifiesto de Descargue").',
                'entity_type' => Workflow::ENTITY_TYPES[3], // MANIFEST
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

        // Grafo principal, autoría humana LOGÍSTICA (lado receptor).
        $this->createTransition($version->id, 'DRAFT', 'GENERATED', roleId: $logistica->id);
        $this->createTransition($version->id, 'SIGNED', 'CLOSED', roleId: $logistica->id);

        // Transiciones AUTOMÁTICAS disparadas por la firma (sin rol).
        $this->createTransition($version->id, 'GENERATED', 'PARTIALLY_SIGNED', isAutomatic: true);
        $this->createTransition($version->id, 'PARTIALLY_SIGNED', 'SIGNED', isAutomatic: true);

        // Cancelación -- SOLO desde Generated/PartiallySigned.
        foreach (self::CANCELLABLE_STATUSES as $fromStatus) {
            $this->createTransition($version->id, $fromStatus, 'CANCELLED', roleId: $logistica->id);
        }

        WorkflowEntityBinding::query()->updateOrCreate(
            ['entity_table' => 'manifest_unloads', 'status_column' => 'manifest_status_id'],
            ['workflow_id' => $workflow->id, 'status_catalog_table' => 'manifest_statuses'],
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
