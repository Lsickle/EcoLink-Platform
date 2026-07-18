<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $this->call(UserStatusSeeder::class);
        $this->call(PermissionSeeder::class);
        $this->call(RoleSeeder::class);
        $this->call(RolePermissionSeeder::class);
        $this->call(BusinessRoleSeeder::class);
        $this->call(OrganizationStatusSeeder::class);
        // Debe correr justo después de OrganizationStatusSeeder (necesita el
        // estado ACT) y antes de cualquier consumidor del gate de plataforma
        // (p. ej. user:create-admin) -- ver PlatformOrganizationSeeder.
        $this->call(PlatformOrganizationSeeder::class);
        // Incidente 2026-07-16: la cuenta admin real del proyecto
        // (luisdelahoz0@gmail.com) solo se creaba a mano vía
        // `user:create-admin` y nunca quedaba sembrada -- cada reset de la
        // BD de desarrollo la borraba. Debe correr justo después de
        // PlatformOrganizationSeeder (misma dependencia que el comando que
        // reutiliza), ver docblock de PlatformAdminSeeder.
        $this->call(PlatformAdminSeeder::class);
        // Batch 1/3 de Catálogos Maestros (2026-07-15): orden en cascada
        // países -> departamentos -> municipios -> localidades (cada
        // seeder reconstruye el mapeo padre->hijo consultando la fuente
        // JSON + la tabla ya sembrada, ver docblock de cada uno).
        $this->call(CountrySeeder::class);
        $this->call(DepartmentSeeder::class);
        $this->call(MunicipalitySeeder::class);
        $this->call(LocalitySeeder::class);
        $this->call(BranchTypeSeeder::class);
        $this->call(WasteStreamSeeder::class);
        $this->call(UnCodeSeeder::class);
        // Batch 2/3 de Catálogos Maestros (RESPEL): 3 catálogos globales sin
        // dependencias entre sí ni con los anteriores.
        $this->call(HazardCharacteristicSeeder::class);
        $this->call(WasteCategorySeeder::class);
        $this->call(PhysicalStateSeeder::class);
        // Batch 3/3 (último) de Catálogos Maestros: 3 catálogos globales sin
        // dependencias entre sí ni con los anteriores. `packaging_types`
        // tiene datos reales; `packaging_conditions`/`vehicle_types` son
        // PROVISIONALES (ver AVISO en sus propios seeders).
        $this->call(PackagingTypeSeeder::class);
        $this->call(PackagingConditionSeeder::class);
        $this->call(VehicleTypeSeeder::class);

        // Módulo Tratamiento (RN-063/D-R02): catálogo GLOBAL de 15
        // tratamientos ambientales reales -- sin dependencias de otros
        // seeders de este bloque.
        $this->call(TreatmentSeeder::class);

        // Núcleo del Módulo Residuos (declaración + clasificación): 4
        // catálogos globales nuevos, mismo patrón exacto que los Batches 1-3
        // de Catálogos Maestros -- sin dependencias entre sí ni con los
        // anteriores.
        $this->call(WasteTypeSeeder::class);
        $this->call(MeasurementUnitSeeder::class);
        $this->call(GenerationFrequencySeeder::class);
        $this->call(WasteOperationalStatusSeeder::class);

        // Datos de demostración (no de catálogo crítico): 3 organizaciones
        // reales (Generador/Gestor/Subgestor) con sedes y contactos -- ver
        // docblock de DemoOrganizationsSeeder.
        $this->call(DemoOrganizationsSeeder::class);

        // Catálogo Maestro "Áreas Organizacionales": jerarquía de demo (1
        // raíz + 3 hijas) por cada una de las 3 organizaciones demo -- debe
        // correr DESPUÉS de DemoOrganizationsSeeder (ya corrió arriba).
        $this->call(OrganizationalAreaSeeder::class);

        // CRUD de Vehículos (CU-051): 15 vehículos de demo (5 por
        // organización) -- debe correr DESPUÉS de DemoOrganizationsSeeder y
        // VehicleTypeSeeder (ambos ya corrieron arriba).
        $this->call(DemoVehiclesSeeder::class);

        // Módulo Tratamiento: habilita branch_treatments de demo en las 3
        // sedes de la organización Gestor -- debe correr DESPUÉS de
        // DemoOrganizationsSeeder, TreatmentSeeder y WasteStreamSeeder
        // (todos ya corrieron arriba).
        $this->call(DemoBranchTreatmentsSeeder::class);

        // 12 usuarios de demo (4 por organización, mezcla ADMINISTRADOR/
        // LOGÍSTICA) -- debe correr DESPUÉS de DemoOrganizationsSeeder y de
        // RoleSeeder (rol LOGÍSTICA, ya sembrado arriba).
        $this->call(DemoUsersSeeder::class);
    }
}
