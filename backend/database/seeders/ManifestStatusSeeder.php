<?php

namespace Database\Seeders;

use App\Models\ManifestStatus;
use App\Models\Organization;
use Illuminate\Database\Seeder;

/**
 * Catálogo BASE "manifest_statuses" (Módulo Manifiesto de Cargue, Fase 3,
 * D-MAN-01) -- 8 filas confirmadas (issue MAN-17, 2026-07-10): pipeline
 * lineal Draft -> Generated -> PartiallySigned -> Signed -> InTransit ->
 * Received -> Closed, rama Cancelled (alcanzable desde Generated/
 * PartiallySigned, ver ManifestLoadWorkflowSeeder).
 *
 * ALCANCE de este lote (Fase 3, "Manifiesto de Cargue"): solo se
 * transiciona `manifest_loads` hasta InTransit. Received/Closed pertenecen
 * al ciclo de vida del futuro `manifest_unloads` (Fase 5, descarga en
 * planta del Gestor) -- se siembran aquí (mismo catálogo compartido, ver
 * esquema-bd) para que el vocabulario esté completo, pero
 * `ManifestLoadWorkflowSeeder` NO crea ninguna `workflow_transition` hacia
 * ellos en este lote.
 *
 * `tenant_organization_id` = organización PLATAFORMA -- mismo patrón EXACTO
 * que `TransportStatusSeeder`/`RespelStatusSeeder`: catálogo BASE de
 * vocabulario compartido.
 */
class ManifestStatusSeeder extends Seeder
{
    /**
     * code => [name, sort_order, is_initial, is_final]
     */
    private const STATUSES = [
        'DRAFT' => ['Borrador', 1, true, false],
        'GENERATED' => ['Generado', 2, false, false],
        'PARTIALLY_SIGNED' => ['Parcialmente Firmado', 3, false, false],
        'SIGNED' => ['Firmado', 4, false, false],
        'IN_TRANSIT' => ['En Tránsito', 5, false, false],
        'RECEIVED' => ['Recibido', 6, false, false],
        'CLOSED' => ['Cerrado', 7, false, true],
        'CANCELLED' => ['Cancelado', 8, false, true],
    ];

    public function run(): void
    {
        $platformOrganization = Organization::query()
            ->where('tax_id', PlatformOrganizationSeeder::PLATFORM_TAX_ID)
            ->firstOrFail();

        foreach (self::STATUSES as $code => $definition) {
            [$name, $sortOrder, $isInitial, $isFinal] = $definition;

            ManifestStatus::query()->updateOrCreate(
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
