<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\BranchType;
use App\Models\BusinessRole;
use App\Models\Country;
use App\Models\Department;
use App\Models\Locality;
use App\Models\Municipality;
use App\Models\Organization;
use App\Models\OrganizationBusinessRole;
use App\Models\OrganizationContact;
use App\Models\OrganizationStatus;
use App\Models\Person;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * Datos de demostración (no de catálogo crítico): 3 organizaciones, una por
 * cada `business_role` real (`GENERATOR`/`GESTOR`/`SUBGESTOR`, ya sembrados
 * por `BusinessRoleSeeder`), 3 sedes cada una (Bogotá/Medellín/Cali, con IDs
 * geográficos ya verificados contra la BD de dev) y 5 contactos cada una
 * (`Person` + vínculo `organization_contacts` a nivel organización,
 * `branch_id=null`).
 *
 * IDs geográficos usados (confirmados por tinker antes de escribir este
 * seeder, no asumidos): `country_id=294` (Colombia) para las 3 ciudades;
 * Bogotá `department_id=43`/`municipality_id=1292`/`locality_id=24`
 * (Chapinero); Medellín `department_id=39`/`municipality_id=1258`; Cali
 * `department_id=68`/`municipality_id=2223` (sin localidad -- ese catálogo
 * solo aplica a Bogotá).
 *
 * Idempotente por `tax_id` (organizaciones, vía `firstOrCreate`) y por
 * `(organization_id, code)` (sedes) -- los 15 contactos NO son idempotentes
 * (cada corrida agrega 5 `Person` nuevas por organización): es un seeder de
 * demo, no de catálogo crítico, y `document_number` debe ser único por fila
 * real de `people`.
 */
class DemoOrganizationsSeeder extends Seeder
{
    public function run(): void
    {
        $activeStatusId = OrganizationStatus::query()->where('code', 'ACT')->value('id');

        // IDs de geografía resueltos por llave natural, NUNCA hardcodeados
        // (bug real encontrado 2026-07-16: los ids estaban fijos como
        // 294/43/1292/24 etc., válidos solo contra el estado incremental de
        // la BD de dev en ese momento -- un `migrate:fresh --seed` genuino
        // reordena los ids de `CountrySeeder`/`DepartmentSeeder`/etc. desde
        // cero, así que Colombia puede terminar en cualquier id según el
        // orden del JSON fuente, no necesariamente 294).
        $colombiaId = Country::query()->where('iso_code', 'CO')->value('id');
        $bogotaDeptId = Department::query()->where('name', 'BOGOTÁ D.C.')->value('id');
        $antioquiaId = Department::query()->where('name', 'ANTIOQUIA')->value('id');
        $valleId = Department::query()->where('name', 'VALLE DEL CAUCA')->value('id');
        $bogotaMunicipalityId = Municipality::query()->where('name', 'BOGOTA D.C.')->where('department_id', $bogotaDeptId)->value('id');
        $medellinMunicipalityId = Municipality::query()->where('name', 'MEDELLÍN')->where('department_id', $antioquiaId)->value('id');
        $caliMunicipalityId = Municipality::query()->where('name', 'CALI')->where('department_id', $valleId)->value('id');
        $chapineroId = Locality::query()->where('name', 'CHAPINERO')->where('municipality_id', $bogotaMunicipalityId)->value('id');

        $bogota = ['country_id' => $colombiaId, 'department_id' => $bogotaDeptId, 'municipality_id' => $bogotaMunicipalityId, 'locality_id' => $chapineroId, 'address' => 'Calle 100 # 15-20, Chapinero'];
        $medellin = ['country_id' => $colombiaId, 'department_id' => $antioquiaId, 'municipality_id' => $medellinMunicipalityId, 'locality_id' => null, 'address' => 'Carrera 43A # 5-15, El Poblado'];
        $cali = ['country_id' => $colombiaId, 'department_id' => $valleId, 'municipality_id' => $caliMunicipalityId, 'locality_id' => null, 'address' => 'Avenida 6N # 28-10, Granada'];

        $organizations = [
            [
                'business_role_code' => 'GENERATOR',
                'legal_name' => 'Industrias Metálicas del Norte S.A.S.',
                'trade_name' => 'Immetal',
                'tax_id' => '900123456-1',
                'branch_type_code' => 'PLT', // Planta -- coherente con un Generador industrial.
                'branch_code_prefix' => 'IMMETAL',
                'contacts' => [
                    ['Carlos', 'Ramírez', 'Gerente General'],
                    ['Luz Elena', 'Vargas', 'Coordinador HSEQ'],
                    ['Andrés', 'Gómez', 'Jefe de Planta'],
                    ['Paula', 'Rojas', 'Analista Ambiental'],
                    ['Jhon Fredy', 'Martínez', 'Auxiliar de Logística'],
                ],
            ],
            [
                'business_role_code' => 'GESTOR',
                'legal_name' => 'Gestión Ambiental Integral EcoTrata S.A.S.',
                'trade_name' => 'EcoTrata',
                'tax_id' => '900234567-2',
                'branch_type_code' => 'ACO', // Centro de Acopio -- coherente con un Gestor.
                'branch_code_prefix' => 'ECOTRATA',
                'contacts' => [
                    ['Diana', 'Cárdenas', 'Gerente General'],
                    ['Fernando', 'Beltrán', 'Director Técnico'],
                    ['Sandra Milena', 'Cortés', 'Coordinador de Tratamiento'],
                    ['Julián', 'Pineda', 'Supervisor de Planta'],
                    ['Natalia', 'Suárez', 'Analista de Calidad'],
                ],
            ],
            [
                'business_role_code' => 'SUBGESTOR',
                'legal_name' => 'Transportes y Logística Verde S.A.S.',
                'trade_name' => 'LogVerde',
                'tax_id' => '900345678-3',
                'branch_type_code' => 'OPR', // Operativa -- coherente con un Subgestor de transporte.
                'branch_code_prefix' => 'LOGVERDE',
                'contacts' => [
                    ['Ricardo', 'Peña', 'Gerente de Operaciones'],
                    ['Mónica', 'Salazar', 'Coordinador de Transporte'],
                    ['Edwin', 'Torres', 'Supervisor de Flota'],
                    ['Wilson', 'Muñoz', 'Conductor Líder'],
                    ['Yolanda', 'Ospina', 'Auxiliar Administrativo'],
                ],
            ],
        ];

        $cities = [
            ['name' => 'Bogotá', ...$bogota],
            ['name' => 'Medellín', ...$medellin],
            ['name' => 'Cali', ...$cali],
        ];

        foreach ($organizations as $organizationData) {
            $businessRole = BusinessRole::query()->where('code', $organizationData['business_role_code'])->firstOrFail();
            $branchType = BranchType::query()->where('code', $organizationData['branch_type_code'])->firstOrFail();

            $organization = Organization::query()->firstOrCreate(
                ['tax_id' => $organizationData['tax_id']],
                [
                    'legal_name' => $organizationData['legal_name'],
                    'trade_name' => $organizationData['trade_name'],
                    'tax_id_type' => 'NIT',
                    'organization_status_id' => $activeStatusId,
                    'is_active' => true,
                    'country_code' => 'CO',
                    // `organizations.risk_level` tiene DEFAULT 'BAJO' (mayúscula) en la
                    // migración, pero el resto del sistema usa minúscula
                    // (bajo/medio/alto/critico) -- ver el mismo gap documentado en
                    // OrganizationController::store(). Sin esto, OrganizationDetailScreen
                    // crashea con `RISK_LEVEL_CLASSES['BAJO']` undefined.
                    'risk_level' => 'bajo',
                ],
            );

            OrganizationBusinessRole::query()->updateOrCreate(
                ['organization_id' => $organization->id, 'business_role_id' => $businessRole->id],
                ['assigned_at' => now(), 'is_active' => true],
            );

            foreach ($cities as $city) {
                Branch::query()->firstOrCreate(
                    ['organization_id' => $organization->id, 'code' => $organizationData['branch_code_prefix'].'_'.strtoupper(Str::ascii($city['name']))],
                    [
                        'branch_type_id' => $branchType->id,
                        'name' => "Sede {$city['name']}",
                        'status' => 'ACTIVE',
                        'country_id' => $city['country_id'],
                        'department_id' => $city['department_id'],
                        'municipality_id' => $city['municipality_id'],
                        'locality_id' => $city['locality_id'],
                        'address' => $city['address'],
                        'phone' => '601'.fake()->numerify('#######'),
                        'email' => strtolower(Str::slug($organizationData['trade_name'])).'.'.strtolower(Str::ascii($city['name'])).'@example.com',
                        'is_active' => true,
                    ],
                );
            }

            foreach ($organizationData['contacts'] as $index => [$firstName, $lastName, $positionTitle]) {
                $person = Person::factory()->create([
                    'document_type' => 'CC',
                    'document_number' => fake()->unique()->numerify('#########'),
                    'first_name' => $firstName,
                    'last_name' => $lastName,
                    'email' => strtolower(Str::slug("{$firstName} {$lastName}")).'@'.strtolower(Str::slug($organizationData['trade_name'])).'.com',
                ]);

                OrganizationContact::factory()->create([
                    'contact_id' => $person->id,
                    'organization_id' => $organization->id,
                    'branch_id' => null,
                    'position_title' => $positionTitle,
                    'relationship_type' => 'Empleado',
                    'is_primary' => $index === 0,
                    'is_active' => true,
                ]);
            }
        }
    }
}
