<?php

namespace Database\Seeders;

use App\Models\Organization;
use App\Models\RespelStatus;
use Illuminate\Database\Seeder;

/**
 * Catálogo BASE "respel_statuses" (motor de Workflow, D-WF-02) -- 11 filas:
 * 5 del eje TÉCNICO + 6 del eje COMERCIAL de `waste_treatment_approvals`.
 *
 * Semántica EXACTA replicada de la lógica hoy hardcodeada en
 * `WasteTreatmentApprovalController` (no se inventa nada nuevo):
 *   - Técnico: nace en `TECH_PENDING` (is_initial). `approveTechnical()`
 *     resuelve PENDING -> `TECH_APPROVED` (sin restricciones) o
 *     `TECH_RESTRICTED` (si `restrictions` viene lleno) -- AMBOS son un
 *     desenlace positivo de la evaluación técnica (`is_approved_status=true`),
 *     la diferencia es solo si trae condiciones adicionales
 *     (`requires_additional_information=true` en RESTRICTED).
 *     `rejectTechnical()` resuelve PENDING -> `TECH_REJECTED`
 *     (`is_rejected_status=true`). Los 3 destinos son finales -- el
 *     controller no permite ninguna transición ADICIONAL una vez resuelto
 *     el eje técnico. `TECH_UNDER_REVIEW` es vocabulario reservado del
 *     catálogo BASE (documentado en esquema-bd) sin transición viva hoy en
 *     el controller -- se siembra igual (el catálogo de CÓDIGOS es
 *     compartido y estable aunque el workflow actual no lo alcance,
 *     ver WorkflowSeeder).
 *   - Comercial: nace en `COM_DRAFT` (is_initial). `quote()` -> `COM_QUOTED`,
 *     `negotiate()` -> `COM_NEGOTIATING`, `approveCommercial()` ->
 *     `COM_APPROVED` (is_approved_status), `rejectCommercial()` ->
 *     `COM_REJECTED` (is_rejected_status), `cancel()` -> `COM_CANCELLED`
 *     (alcanzable incluso desde APPROVED/REJECTED, ver
 *     `TERMINAL_COMMERCIAL_STATUSES`/`cancel()` en el controller -- por
 *     eso `COM_CANCELLED` es el único estado con una transición de
 *     "reapertura" desde otro estado final, ver WorkflowSeeder). APPROVED/
 *     REJECTED/CANCELLED son finales (`TERMINAL_COMMERCIAL_STATUSES`
 *     del controller); DRAFT/QUOTED/NEGOTIATING no lo son.
 *
 * `tenant_organization_id` = organización PLATAFORMA (decisión de diseño
 * documentada en la migración `create_respel_statuses_table`) -- catálogo
 * BASE de vocabulario, compartido por todas las organizaciones.
 */
class RespelStatusSeeder extends Seeder
{
    /**
     * code => [name, sort_order, is_initial, is_final, is_approved_status,
     * is_rejected_status, requires_additional_information]
     */
    private const TECHNICAL_STATUSES = [
        'TECH_PENDING' => ['Pendiente', 1, true, false, false, false, false],
        'TECH_UNDER_REVIEW' => ['En Revisión', 2, false, false, false, false, false],
        'TECH_APPROVED' => ['Aprobado', 3, false, true, true, false, false],
        'TECH_RESTRICTED' => ['Aprobado con Restricciones', 4, false, true, true, false, true],
        'TECH_REJECTED' => ['Rechazado', 5, false, true, false, true, false],
    ];

    private const COMMERCIAL_STATUSES = [
        'COM_DRAFT' => ['Borrador', 1, true, false, false, false],
        'COM_QUOTED' => ['Cotizado', 2, false, false, false, false],
        'COM_NEGOTIATING' => ['En Negociación', 3, false, false, false, false],
        'COM_APPROVED' => ['Aprobado', 4, false, true, true, false],
        'COM_REJECTED' => ['Rechazado', 5, false, true, false, true],
        'COM_CANCELLED' => ['Cancelado', 6, false, true, false, false],
    ];

    public function run(): void
    {
        $platformOrganization = Organization::query()
            ->where('tax_id', PlatformOrganizationSeeder::PLATFORM_TAX_ID)
            ->firstOrFail();

        foreach (self::TECHNICAL_STATUSES as $code => $definition) {
            [$name, $sortOrder, $isInitial, $isFinal, $isApproved, $isRejected, $requiresAdditionalInformation] = $definition;

            RespelStatus::query()->updateOrCreate(
                ['tenant_organization_id' => $platformOrganization->id, 'code' => $code],
                [
                    'name' => $name,
                    'sort_order' => $sortOrder,
                    'is_initial' => $isInitial,
                    'is_final' => $isFinal,
                    'is_approved_status' => $isApproved,
                    'is_rejected_status' => $isRejected,
                    'requires_commercial_review' => false,
                    'requires_environmental_review' => false,
                    'allows_service_request' => $isApproved,
                    'requires_additional_information' => $requiresAdditionalInformation,
                    'is_active' => true,
                ],
            );
        }

        foreach (self::COMMERCIAL_STATUSES as $code => $definition) {
            [$name, $sortOrder, $isInitial, $isFinal, $isApproved, $isRejected] = $definition;

            RespelStatus::query()->updateOrCreate(
                ['tenant_organization_id' => $platformOrganization->id, 'code' => $code],
                [
                    'name' => $name,
                    'sort_order' => $sortOrder,
                    'is_initial' => $isInitial,
                    'is_final' => $isFinal,
                    'is_approved_status' => $isApproved,
                    'is_rejected_status' => $isRejected,
                    'requires_commercial_review' => false,
                    'requires_environmental_review' => false,
                    'allows_service_request' => false,
                    'requires_additional_information' => false,
                    'is_active' => true,
                ],
            );
        }
    }
}
