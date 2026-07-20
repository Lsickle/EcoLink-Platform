<?php

namespace Database\Seeders;

use App\Models\Organization;
use App\Models\UnloadRequestStatus;
use Illuminate\Database\Seeder;

/**
 * Catálogo BASE "unload_request_statuses" (Fase 4 "Cita de Recepción en
 * Planta", D-PRG-02) -- grafo grueso confirmado por esta tarea: Draft ->
 * Submitted -> Approved/Rejected (4 filas, sin agregado por ítems, mismo
 * espíritu que `ServiceRequestWorkflowSeeder` pero mucho más simple -- ver
 * `UnloadRequestWorkflowSeeder`).
 *
 * `tenant_organization_id` = organización PLATAFORMA -- mismo patrón EXACTO
 * que `ManifestStatusSeeder`/`TransportStatusSeeder`: catálogo BASE de
 * vocabulario compartido.
 */
class UnloadRequestStatusSeeder extends Seeder
{
    /**
     * code => [name, sort_order, is_initial, is_final]
     */
    private const STATUSES = [
        'DRAFT' => ['Borrador', 1, true, false],
        'SUBMITTED' => ['Enviada', 2, false, false],
        'APPROVED' => ['Aprobada', 3, false, true],
        'REJECTED' => ['Rechazada', 4, false, true],
    ];

    public function run(): void
    {
        $platformOrganization = Organization::query()
            ->where('tax_id', PlatformOrganizationSeeder::PLATFORM_TAX_ID)
            ->firstOrFail();

        foreach (self::STATUSES as $code => $definition) {
            [$name, $sortOrder, $isInitial, $isFinal] = $definition;

            UnloadRequestStatus::query()->updateOrCreate(
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
