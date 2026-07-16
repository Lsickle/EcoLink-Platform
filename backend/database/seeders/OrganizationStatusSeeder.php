<?php

namespace Database\Seeders;

use App\Models\OrganizationStatus;
use Illuminate\Database\Seeder;

/**
 * Catálogo de 5 organization_statuses. `requires_document_validation` y
 * `requires_commercial_approval` quedan en false para las 5 filas -- no hay
 * evidencia de qué estado los necesitaría en true, no se inventan valores.
 */
class OrganizationStatusSeeder extends Seeder
{
    public function run(): void
    {
        $organizationStatuses = [
            ['code' => 'PRO', 'name' => 'PROSPECTO', 'is_initial' => true, 'is_final' => false, 'allows_operation' => false, 'is_suspended' => false, 'color_hex' => '#3d75dc', 'sort_order' => 1],
            ['code' => 'ACT', 'name' => 'ACTIVA', 'is_initial' => false, 'is_final' => false, 'allows_operation' => true, 'is_suspended' => false, 'color_hex' => '#228b33', 'sort_order' => 2],
            ['code' => 'SUS', 'name' => 'SUSPENDIDA', 'is_initial' => false, 'is_final' => false, 'allows_operation' => false, 'is_suspended' => true, 'color_hex' => '#c57d10', 'sort_order' => 3],
            ['code' => 'INA', 'name' => 'INACTIVA', 'is_initial' => false, 'is_final' => true, 'allows_operation' => false, 'is_suspended' => false, 'color_hex' => '#737373', 'sort_order' => 4],
            ['code' => 'BLO', 'name' => 'BLOQUEADA', 'is_initial' => false, 'is_final' => false, 'allows_operation' => false, 'is_suspended' => true, 'color_hex' => '#cc0c0c', 'sort_order' => 5],
        ];

        foreach ($organizationStatuses as $organizationStatus) {
            OrganizationStatus::query()->updateOrCreate(
                ['code' => $organizationStatus['code']],
                [
                    ...$organizationStatus,
                    'requires_document_validation' => false,
                    'requires_commercial_approval' => false,
                    'is_active' => true,
                ],
            );
        }
    }
}
