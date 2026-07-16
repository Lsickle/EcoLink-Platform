<?php

namespace Database\Seeders;

use App\Models\Organization;
use App\Models\OrganizationStatus;
use Illuminate\Database\Seeder;

/**
 * Hallazgo Alto (especialista-seguridad, 2026-07-14, revisión del mecanismo
 * de invitación): `invitation_requests` es una cola global sin frontera de
 * tenant -- cualquier admin (`users.create`) de cualquier organización podía
 * ver/aprobar/rechazar solicitudes de cualquier otra, exponiendo PII de
 * terceros. Decisión explícita del usuario del proyecto (no interpretación
 * propia): solo el staff de la organización PLATAFORMA
 * (`organizations.is_platform_tenant=true`, D-CER-04: "exactamente una fila
 * TRUE en todo el sistema") puede gestionar esa cola -- ver
 * User::isPlatformStaff() e InvitationRequestController.
 *
 * Sin esta fila sembrada, el nuevo gate sería insatisfacible por
 * construcción (nadie podría pasar `isPlatformStaff()`). `organizations` no
 * tiene columna `code` (esquema-bd) -- se usa `tax_id` como campo único
 * lógico de idempotencia (`updateOrCreate`), consistente con cómo
 * `organizations` modela unicidad de negocio (RN-002/T-04: `tax_id` +
 * `tax_id_type`); no hay UNIQUE de base de datos sobre `tax_id` en solitario
 * (solo documentado como regla de negocio, ver migración de `organizations`),
 * pero basta para la idempotencia de este seeder porque ningún otro seeder
 * ni flujo de la aplicación crea organizaciones con este `tax_id`.
 *
 * Debe correr DESPUÉS de {@see OrganizationStatusSeeder} (necesita el
 * estado `ACT`) y ANTES de cualquier seeder/comando que asuma que la
 * organización plataforma ya existe (p. ej. `user:create-admin`, ver
 * CreateAdminCommand).
 */
class PlatformOrganizationSeeder extends Seeder
{
    public const PLATFORM_TAX_ID = 'ECOLINK-PLATFORM';

    public function run(): void
    {
        $activeStatus = OrganizationStatus::query()->where('code', 'ACT')->firstOrFail();

        // Hallazgo Bajo (especialista-seguridad, 2026-07-14): `is_platform_tenant`
        // ya no está en Organization::$fillable (protección de mass-assignment
        // contra D-CER-04) -- se asigna vía forceFill() + save() en vez de
        // pasarlo al array de valores de updateOrCreate(), que lo descartaría
        // en silencio.
        $organization = Organization::query()->updateOrCreate(
            ['tax_id' => self::PLATFORM_TAX_ID],
            [
                'legal_name' => 'EcoLink',
                'trade_name' => 'EcoLink',
                'tax_id_type' => 'NIT',
                'organization_status_id' => $activeStatus->id,
                'is_active' => true,
                'observations' => 'Organización plataforma sembrada por PlatformOrganizationSeeder -- exactamente una fila is_platform_tenant=true (D-CER-04).',
            ],
        );

        $organization->forceFill(['is_platform_tenant' => true])->save();
    }
}
