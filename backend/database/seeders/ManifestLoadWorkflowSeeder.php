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
 * Workflow BASE "Manifiesto de Cargue" (motor de Workflow genérico, D-WF-01,
 * `entity_type=MANIFEST`, `tenant_organization_id=NULL`, `is_system=true`) --
 * mismo patrón exacto que `TransportScheduleWorkflowSeeder`/`WorkflowSeeder`.
 * Módulo Manifiesto de Cargue, Fase 3.
 *
 * Grafo (8 estados, `ManifestStatusSeeder`):
 *   Draft -> Generated -> PartiallySigned -> Signed -> InTransit
 *   Cancelled alcanzable SOLO desde Generated/PartiallySigned (NO desde
 *   Draft ni después de Signed/InTransit -- instrucción explícita de la
 *   tarea).
 *
 * ALCANCE DIFERIDO explícito: `Received`/`Closed` pertenecen al ciclo de
 * vida del futuro `manifest_unloads` (Fase 5, descarga en planta del
 * Gestor) -- NINGUNA transición se siembra hacia esos 2 códigos en este
 * lote, aunque el catálogo `manifest_statuses` ya los incluya (vocabulario
 * compartido, ver `ManifestStatusSeeder`).
 *
 * Roles:
 *   - Draft -> Generated ("generate()"), Signed -> InTransit ("startTransit()"),
 *     Generated/PartiallySigned -> Cancelled ("cancel()"): `Role` de sistema
 *     `LOGÍSTICA` -- mismo criterio EXACTO que `TransportScheduleWorkflowSeeder`
 *     (D-PRG-14): este flujo lo opera el MISMO actor que programó el
 *     transporte (Coordinador Logístico, o el Generador+TRANSPORTER en
 *     autotransporte), razonado explícitamente en el enunciado de esta
 *     tarea como el precedente más cercano frente a `business_role GESTOR`
 *     (Solicitudes de Servicio) -- ahí el actor de negocio es
 *     estructuralmente distinto (el Gestor evaluando residuos ajenos), no
 *     el mismo rol operativo que ya gestiona vehículo/conductor/programación.
 *   - Generated -> PartiallySigned, PartiallySigned -> Signed: AUTOMÁTICAS
 *     (`is_automatic=true`), SIN `workflow_transition_roles` -- disparadas
 *     por `ManifestLoadSignatureService::sign()`, que YA valida por su
 *     cuenta (anti-IDOR propio, no delegado al motor) quién puede firmar
 *     como generador/conductor. Mismo criterio EXACTO que la transición
 *     automática SUBMITTED->UNDER_REVIEW de `ServiceRequestWorkflowSeeder`
 *     (sin roles = cualquier actor autenticado que llegue hasta ahí pasa).
 *
 * Sin `workflow_transition_rules` en este lote -- mismo criterio que los
 * otros workflows base ya sembrados.
 */
class ManifestLoadWorkflowSeeder extends Seeder
{
    private const CANCELLABLE_STATUSES = ['GENERATED', 'PARTIALLY_SIGNED'];

    public function run(): void
    {
        $logistica = Role::query()->where('code', 'LOGÍSTICA')->firstOrFail();

        $workflow = Workflow::query()->updateOrCreate(
            ['tenant_organization_id' => null, 'code' => 'MANIFEST_LOAD'],
            [
                'name' => 'Manifiesto de Cargue',
                'description' => 'Workflow base del ciclo de vida de manifest_loads (Fase 3, "Manifiesto de Cargue").',
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

        // Grafo principal, autoría humana LOGÍSTICA.
        $this->createTransition($version->id, 'DRAFT', 'GENERATED', roleId: $logistica->id);
        $this->createTransition($version->id, 'SIGNED', 'IN_TRANSIT', roleId: $logistica->id);

        // Transiciones AUTOMÁTICAS disparadas por la firma (sin rol).
        $this->createTransition($version->id, 'GENERATED', 'PARTIALLY_SIGNED', isAutomatic: true);
        $this->createTransition($version->id, 'PARTIALLY_SIGNED', 'SIGNED', isAutomatic: true);

        // Cancelación -- SOLO desde Generated/PartiallySigned.
        foreach (self::CANCELLABLE_STATUSES as $fromStatus) {
            $this->createTransition($version->id, $fromStatus, 'CANCELLED', roleId: $logistica->id);
        }

        WorkflowEntityBinding::query()->updateOrCreate(
            ['entity_table' => 'manifest_loads', 'status_column' => 'manifest_status_id'],
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
