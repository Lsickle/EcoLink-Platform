<?php

namespace Database\Seeders;

use App\Models\Organization;
use App\Models\TransportStatus;
use Illuminate\Database\Seeder;

/**
 * Catálogo BASE "transport_statuses" (Módulo Programación Logística,
 * D-PRG-08/D-PRG-11) -- 7 filas, confirmadas en vivo contra Figma ("Estados
 * de Programación de Transporte", `906:11704`, ver `06-especialista-ux.md`
 * Adenda #2): pipeline lineal BOR -> PEND -> PROG -> CONF -> EJEC -> FIN,
 * rama CANC (alcanzable desde los estados no-operativos, ver
 * TransportScheduleWorkflowSeeder).
 *
 * D-PRG-11: los 9 estados nombrados de "# Workflow de Programación
 * Logística.md" (Draft/PendingValidation/Approved/ResourceConfirmation/
 * Scheduled/InExecution/Completed/Rescheduled/Cancelled) NO se siembran
 * como vocabulario obligatorio -- ese documento queda como referencia
 * semántica (mismo criterio ya usado con RN-SCH-XXX, D-PRG-07). Alineación
 * aproximada: BOR≈Draft, PEND≈PendingValidation, PROG≈Approved,
 * CONF≈ResourceConfirmation/Scheduled, EJEC≈InExecution, FIN≈Completed,
 * CANC≈Cancelled -- sin estado "Rescheduled" propio (CU-027 se rastrea vía
 * `transport_schedules.version_number`/`parent_schedule_id`, confirmado sin
 * hueco visual en el Adenda de especialista-ux).
 *
 * `tenant_organization_id` = organización PLATAFORMA -- mismo patrón EXACTO
 * que `RespelStatusSeeder`: catálogo BASE de vocabulario compartido: D-PRG-08
 * aplaza `is_system`/activación-por-organización (patrón D-R05) a la
 * reconciliación transversal ya prevista (D-S15), no se resuelve aquí.
 */
class TransportStatusSeeder extends Seeder
{
    /**
     * code => [name, sort_order, is_initial, is_final]
     */
    private const STATUSES = [
        'BOR' => ['Borrador', 1, true, false],
        'PEND' => ['Pend. Asignación', 2, false, false],
        'PROG' => ['Programada', 3, false, false],
        'CONF' => ['Confirmada', 4, false, false],
        'EJEC' => ['En Ejecución', 5, false, false],
        'FIN' => ['Finalizada', 6, false, true],
        'CANC' => ['Cancelada', 7, false, true],
    ];

    public function run(): void
    {
        $platformOrganization = Organization::query()
            ->where('tax_id', PlatformOrganizationSeeder::PLATFORM_TAX_ID)
            ->firstOrFail();

        foreach (self::STATUSES as $code => $definition) {
            [$name, $sortOrder, $isInitial, $isFinal] = $definition;

            TransportStatus::query()->updateOrCreate(
                ['tenant_organization_id' => $platformOrganization->id, 'code' => $code],
                [
                    'name' => $name,
                    'sort_order' => $sortOrder,
                    'is_initial' => $isInitial,
                    'is_final' => $isFinal,
                    'is_active' => true,
                ],
            );
        }
    }
}
