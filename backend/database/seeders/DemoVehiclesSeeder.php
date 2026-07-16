<?php

namespace Database\Seeders;

use App\Models\Organization;
use App\Models\Vehicle;
use App\Models\VehicleType;
use Illuminate\Database\Seeder;

/**
 * Datos de demostración (no de catálogo crítico): 5 vehículos por cada una
 * de las 3 organizaciones demo ya sembradas por `DemoOrganizationsSeeder`
 * (busca por `tax_id` real, mismo criterio idempotente). Debe correr
 * DESPUÉS de `DemoOrganizationsSeeder` (necesita las organizaciones) y de
 * `VehicleTypeSeeder` (necesita el catálogo `vehicle_types`).
 *
 * Sin restricción de business_role (decisión ya confirmada): las 3
 * organizaciones demo -- Generador, Gestor y Subgestor -- reciben vehículos
 * por igual, sin importar su rol de negocio.
 *
 * Sin `branch_id` (decisión propia de este lote, mismo criterio que los
 * contactos de demo de `DemoOrganizationsSeeder`, que tampoco los asignan a
 * una sede): los vehículos de demo quedan a nivel organización, no de sede
 * concreta -- más simple y suficiente para verificar el acceso dual
 * (platform staff / tenant admin / LOGÍSTICA) sin depender de qué sede
 * exista en cada corrida.
 *
 * Idempotente por `plate_number` (vía `updateOrCreate`) -- reejecutar el
 * seeder no duplica vehículos.
 */
class DemoVehiclesSeeder extends Seeder
{
    public function run(): void
    {
        $vehicleTypeIds = VehicleType::query()->pluck('id', 'code');

        $organizationsVehicles = [
            // Industrias Metálicas del Norte S.A.S. (Immetal) -- Generador.
            '900123456-1' => [
                ['plate' => 'ABC123', 'type' => 'CAM', 'brand' => 'Chevrolet', 'model' => 'NPR', 'year' => 2020, 'capacity' => 3000, 'hazmat' => false, 'gps' => true],
                ['plate' => 'ABC456', 'type' => 'FURGON', 'brand' => 'Hino', 'model' => '300', 'year' => 2019, 'capacity' => 2000, 'hazmat' => false, 'gps' => false],
                ['plate' => 'ABC789', 'type' => 'TRACTO', 'brand' => 'Kenworth', 'model' => 'T800', 'year' => 2021, 'capacity' => 30000, 'hazmat' => true, 'gps' => true],
                ['plate' => 'ABD123', 'type' => 'CISTERNA', 'brand' => 'International', 'model' => '4300', 'year' => 2018, 'capacity' => 15000, 'hazmat' => true, 'gps' => true],
                ['plate' => 'ABD456', 'type' => 'CAM', 'brand' => 'Chevrolet', 'model' => 'NPR', 'year' => 2022, 'capacity' => 3500, 'hazmat' => false, 'gps' => true],
            ],
            // Gestión Ambiental Integral EcoTrata S.A.S. (EcoTrata) -- Gestor.
            '900234567-2' => [
                ['plate' => 'ECO123', 'type' => 'TRACTO', 'brand' => 'Kenworth', 'model' => 'T800', 'year' => 2020, 'capacity' => 32000, 'hazmat' => true, 'gps' => true],
                ['plate' => 'ECO456', 'type' => 'CAM', 'brand' => 'Foton', 'model' => 'Aumark', 'year' => 2021, 'capacity' => 4000, 'hazmat' => false, 'gps' => false],
                ['plate' => 'ECO789', 'type' => 'CISTERNA', 'brand' => 'Hino', 'model' => '500', 'year' => 2019, 'capacity' => 18000, 'hazmat' => true, 'gps' => true],
                ['plate' => 'ECO321', 'type' => 'FURGON', 'brand' => 'Hino', 'model' => '300', 'year' => 2022, 'capacity' => 2500, 'hazmat' => false, 'gps' => true],
                ['plate' => 'ECO654', 'type' => 'CAM', 'brand' => 'Chevrolet', 'model' => 'NPR', 'year' => 2020, 'capacity' => 3200, 'hazmat' => false, 'gps' => false],
            ],
            // Transportes y Logística Verde S.A.S. (LogVerde) -- Subgestor.
            '900345678-3' => [
                ['plate' => 'LGV123', 'type' => 'TRACTO', 'brand' => 'Kenworth', 'model' => 'T800', 'year' => 2023, 'capacity' => 32000, 'hazmat' => true, 'gps' => true],
                ['plate' => 'LGV456', 'type' => 'TRACTO', 'brand' => 'International', 'model' => 'Lonestar', 'year' => 2021, 'capacity' => 30000, 'hazmat' => true, 'gps' => true],
                ['plate' => 'LGV789', 'type' => 'CISTERNA', 'brand' => 'Freightliner', 'model' => 'M2', 'year' => 2020, 'capacity' => 20000, 'hazmat' => true, 'gps' => true],
                ['plate' => 'LGV321', 'type' => 'FURGON', 'brand' => 'Hino', 'model' => '300', 'year' => 2022, 'capacity' => 2200, 'hazmat' => false, 'gps' => true],
                ['plate' => 'LGV654', 'type' => 'CAM', 'brand' => 'Chevrolet', 'model' => 'NPR', 'year' => 2019, 'capacity' => 3000, 'hazmat' => false, 'gps' => false],
            ],
        ];

        foreach ($organizationsVehicles as $taxId => $vehicles) {
            $organization = Organization::query()->where('tax_id', $taxId)->first();

            if (! $organization) {
                continue;
            }

            foreach ($vehicles as $vehicle) {
                Vehicle::query()->updateOrCreate(
                    ['plate_number' => $vehicle['plate']],
                    [
                        'organization_id' => $organization->id,
                        'branch_id' => null,
                        'vehicle_type_id' => $vehicleTypeIds->get($vehicle['type']),
                        'brand' => $vehicle['brand'],
                        'model' => $vehicle['model'],
                        'manufacturing_year' => $vehicle['year'],
                        'max_load_capacity' => $vehicle['capacity'],
                        'capacity_unit' => 'KG',
                        'supports_hazmat' => $vehicle['hazmat'],
                        'has_gps' => $vehicle['gps'],
                        'operational_status' => 'ACTIVE',
                        'is_active' => true,
                    ],
                );
            }
        }
    }
}
