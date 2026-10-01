<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\BranchTreatment;
use App\Models\BranchType;
use App\Models\Country;
use App\Models\Department;
use App\Models\Locality;
use App\Models\MeasurementUnit;
use App\Models\Municipality;
use App\Models\Organization;
use App\Models\Person;
use App\Models\ServiceItemStatus;
use App\Models\TransportPersonnel;
use App\Models\TransportSchedule;
use App\Models\TransportScheduleItem;
use App\Models\TransportStatus;
use App\Models\Vehicle;
use App\Models\Waste;
use App\Models\WasteServiceRequest;
use App\Models\WasteServiceRequestItem;
use App\Models\WasteTreatmentApproval;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * Datos de demostración (no de catálogo crítico) para la Vista "Programación
 * por Localidad" (mapa de Bogotá): hoy casi todas las `transport_schedules`
 * reales solo existen vía pruebas manuales por UI en Chapinero (única
 * localidad con sedes demo hasta este lote, ver `DemoOrganizationsSeeder`) --
 * sin este seeder, el mapa se vería vacío al probarlo.
 *
 * 1. 5 sedes NUEVAS para Immetal (Generador, `tax_id 900123456-1`) en
 *    localidades de Bogotá distintas a Chapinero (Usaquén/Kennedy/Suba/
 *    Engativá/Fontibón -- norte/sur/occidente), resolviendo `locality_id`
 *    por `code` REAL de `localities` (mismo criterio anti-hardcode que
 *    `DemoOrganizationsSeeder`: nunca IDs fijos). Se suma la sede Chapinero
 *    ya sembrada (`IMMETAL_BOGOTA`) como 6ª localidad -- total 6 sedes de
 *    origen.
 * 2. 2 `TransportPersonnel` demo para EcoTrata (Gestor, `tax_id
 *    900234567-2` -- única organización demo con `can_transport_waste=true`
 *    y `branch_treatments` reales, ver `DemoBranchTreatmentsSeeder`; no
 *    existía ningún seeder de `TransportPersonnel` hasta este lote).
 * 3. Por cada una de las 6 sedes de origen: 2 cadenas completas `Waste`
 *    (clasificable vía factory, mismo patrón que `tsAcceptedItemFixture()`
 *    en `TransportScheduleControllerTest`) -> `WasteTreatmentApproval`
 *    viable de EcoTrata -> `WasteServiceRequest` + ítem `ACCEPTED` ->
 *    `TransportSchedule`, repartidas en una ventana de hoy ± 3 días y en una
 *    mezcla deliberada de los 6 estados del catálogo (2 de cada uno,
 *    incluyendo `CANC`/`FIN` a propósito) -- escritas directamente sobre el
 *    modelo (no vía `TransportScheduleController::store()`) porque este
 *    seeder necesita fijar el estado final de cada programación a mano, sin
 *    recorrer el workflow transición por transición.
 *
 * Total: 12 `transport_schedules` en 6 localidades, repartidas en varias
 * fechas.
 *
 * Idempotente por claves determinísticas (`code`/`request_code`/
 * `schedule_number`, todas con el patrón `*-DEMO-{SEDE}-{n}`) -- reejecutar
 * el seeder no duplica datos.
 *
 * Debe correr DESPUÉS de `DemoOrganizationsSeeder` (Immetal/EcoTrata),
 * `DemoVehiclesSeeder` (vehículos de EcoTrata), `DemoBranchTreatmentsSeeder`
 * (branch_treatments de EcoTrata), `LocalitySeeder` (catálogo de 20
 * localidades) y `TransportScheduleWorkflowSeeder`/`TransportStatusSeeder`
 * (catálogo `transport_statuses`).
 */
class DemoTransportSchedulesSeeder extends Seeder
{
    /**
     * @var list<array{branch_code: string, branch_name: string, locality_code: string}>
     */
    private const NEW_BRANCHES = [
        ['branch_code' => 'IMMETAL_USAQUEN', 'branch_name' => 'Sucursal Usaquén', 'locality_code' => '1'],
        ['branch_code' => 'IMMETAL_KENNEDY', 'branch_name' => 'Sucursal Kennedy', 'locality_code' => '8'],
        ['branch_code' => 'IMMETAL_SUBA', 'branch_name' => 'Sucursal Suba', 'locality_code' => '11'],
        ['branch_code' => 'IMMETAL_ENGATIVA', 'branch_name' => 'Sucursal Engativá', 'locality_code' => '10'],
        ['branch_code' => 'IMMETAL_FONTIBON', 'branch_name' => 'Sucursal Fontibón', 'locality_code' => '9'],
    ];

    /**
     * license_number => [first_name, last_name, license_category]
     */
    private const TRANSPORT_PERSONNEL = [
        'LIC-DEMO-ECOTRATA-01' => ['Jorge', 'Ramírez', 'C2'],
        'LIC-DEMO-ECOTRATA-02' => ['Marta', 'Gil', 'C3'],
    ];

    /**
     * 12 filas (2 por sede): mezcla deliberada de los 6 estados del catálogo
     * `transport_statuses`, 2 de cada uno -- incluye `CANC`/`FIN` a
     * propósito para poder probar ese caso visualmente en el mapa.
     */
    private const STATUS_CYCLE = ['BOR', 'PEND', 'PROG', 'CONF', 'CANC', 'FIN', 'PROG', 'BOR', 'PEND', 'CONF', 'CANC', 'FIN'];

    public function run(): void
    {
        $generator = Organization::query()->where('tax_id', '900123456-1')->first();
        $gestor = Organization::query()->where('tax_id', '900234567-2')->first();

        if (! $generator || ! $gestor) {
            return;
        }

        $colombiaId = Country::query()->where('iso_code', 'CO')->value('id');
        $bogotaDeptId = Department::query()->where('name', 'BOGOTÁ D.C.')->value('id');
        $bogotaMunicipalityId = Municipality::query()->where('name', 'BOGOTA D.C.')->where('department_id', $bogotaDeptId)->value('id');

        if (! $colombiaId || ! $bogotaDeptId || ! $bogotaMunicipalityId) {
            return;
        }

        $plt = BranchType::query()->where('code', 'PLT')->first();

        if (! $plt) {
            return;
        }

        $sourceBranches = [];

        $chapineroBranch = Branch::query()->where('organization_id', $generator->id)->where('code', 'IMMETAL_BOGOTA')->first();

        if ($chapineroBranch) {
            $sourceBranches[] = $chapineroBranch;
        }

        foreach (self::NEW_BRANCHES as $definition) {
            $localityId = Locality::query()
                ->where('municipality_id', $bogotaMunicipalityId)
                ->where('code', $definition['locality_code'])
                ->value('id');

            if ($localityId === null) {
                continue;
            }

            $branch = Branch::query()->firstOrCreate(
                ['organization_id' => $generator->id, 'code' => $definition['branch_code']],
                [
                    'branch_type_id' => $plt->id,
                    'name' => $definition['branch_name'],
                    'status' => 'ACTIVE',
                    'country_id' => $colombiaId,
                    'department_id' => $bogotaDeptId,
                    'municipality_id' => $bogotaMunicipalityId,
                    'locality_id' => $localityId,
                    'address' => "{$definition['branch_name']}, Bogotá D.C.",
                    'phone' => '601'.fake()->numerify('#######'),
                    'email' => 'immetal.'.Str::slug($definition['branch_name']).'@example.com',
                    'is_active' => true,
                ],
            );

            $sourceBranches[] = $branch;
        }

        if ($sourceBranches === []) {
            return;
        }

        $destinationBranch = Branch::query()->where('organization_id', $gestor->id)->where('code', 'ECOTRATA_BOGOTA')->first()
            ?? Branch::query()->where('organization_id', $gestor->id)->first();

        $branchTreatmentId = BranchTreatment::query()->where('organization_id', $gestor->id)->value('id');

        if (! $destinationBranch || ! $branchTreatmentId) {
            return;
        }

        $personnel = [];
        foreach (self::TRANSPORT_PERSONNEL as $license => [$firstName, $lastName, $category]) {
            // Dominio reservado (RFC 2606, mismo criterio que DemoOrganizationsSeeder)
            // -- nunca resuelve a un buzón real, a diferencia de un dominio de
            // organización inventado que alguien podría llegar a registrar.
            $email = 'conductor.'.Str::slug("{$firstName} {$lastName}").'@example.com';

            $person = Person::query()->firstOrCreate(
                ['email' => $email],
                [
                    'document_type' => 'CC',
                    'document_number' => fake()->unique()->numerify('#########'),
                    'first_name' => $firstName,
                    'last_name' => $lastName,
                ],
            );

            $personnel[] = TransportPersonnel::query()->updateOrCreate(
                ['organization_id' => $gestor->id, 'license_number' => $license],
                [
                    'person_id' => $person->id,
                    'license_category' => $category,
                    'license_expiration_date' => now()->addYears(2),
                    'has_hazmat_permit' => true,
                    'is_active' => true,
                ],
            );
        }

        $vehicles = Vehicle::query()->where('organization_id', $gestor->id)->get();

        if ($vehicles->isEmpty() || $personnel === []) {
            return;
        }

        $acceptedStatusId = ServiceItemStatus::query()->where('code', 'ACCEPTED')->value('id');
        $kgMeasurementUnitId = MeasurementUnit::query()->where('code', 'KG')->value('id');

        if (! $acceptedStatusId || ! $kgMeasurementUnitId) {
            return;
        }

        $globalIndex = 0;

        foreach ($sourceBranches as $branch) {
            for ($n = 1; $n <= 2; $n++) {
                $suffix = Str::upper(Str::slug($branch->code, '_')).'-'.$n;

                $wasteCode = "RES-DEMO-{$suffix}";
                $waste = Waste::query()->where('organization_id', $generator->id)->where('code', $wasteCode)->first()
                    ?? Waste::factory()->create([
                        'organization_id' => $generator->id,
                        'branch_id' => $branch->id,
                        'code' => $wasteCode,
                    ]);

                $approval = WasteTreatmentApproval::query()->where('organization_id', $gestor->id)->where('waste_id', $waste->id)->first()
                    ?? WasteTreatmentApproval::factory()->viable()->create([
                        'organization_id' => $gestor->id,
                        'waste_id' => $waste->id,
                        'branch_treatment_id' => $branchTreatmentId,
                    ]);

                $requestCode = "SOL-DEMO-{$suffix}";
                $serviceRequest = WasteServiceRequest::query()->where('request_code', $requestCode)->first()
                    ?? WasteServiceRequest::factory()->create([
                        'organization_id' => $generator->id,
                        'branch_id' => $branch->id,
                        'request_code' => $requestCode,
                    ]);

                $item = WasteServiceRequestItem::query()->where('service_request_id', $serviceRequest->id)->where('waste_id', $waste->id)->first()
                    ?? WasteServiceRequestItem::factory()->create([
                        'service_request_id' => $serviceRequest->id,
                        'waste_id' => $waste->id,
                        'waste_treatment_approval_id' => $approval->id,
                        'item_status_id' => $acceptedStatusId,
                    ]);

                $statusCode = self::STATUS_CYCLE[$globalIndex % count(self::STATUS_CYCLE)];
                $statusId = TransportStatus::query()->where('code', $statusCode)->value('id');

                if (! $statusId) {
                    $globalIndex++;

                    continue;
                }

                $vehicle = $vehicles[$globalIndex % $vehicles->count()];
                $driver = $personnel[$globalIndex % count($personnel)];
                $isActive = ! in_array($statusCode, ['CANC', 'FIN'], true);

                $dayOffset = ($globalIndex % 7) - 3; // reparte en una ventana de hoy ± 3 días
                $hour = 8 + ($globalIndex % 5) * 2; // 8, 10, 12, 14, 16
                $scheduledPickupAt = Carbon::now('America/Bogota')->startOfDay()->addDays($dayOffset)->addHours($hour);

                $scheduleNumber = "PRG-DEMO-{$suffix}";
                $schedule = TransportSchedule::query()->where('schedule_number', $scheduleNumber)->first() ?? new TransportSchedule;

                $schedule->fill([
                    'tenant_organization_id' => $gestor->id,
                    'organization_id' => $gestor->id,
                    'waste_service_request_id' => $serviceRequest->id,
                    'schedule_number' => $scheduleNumber,
                    'source_branch_id' => $branch->id,
                    'destination_branch_id' => $destinationBranch->id,
                    'vehicle_id' => $vehicle->id,
                    'transport_personnel_id' => $driver->id,
                    'scheduled_pickup_at' => $scheduledPickupAt,
                    'priority' => 'NORMAL',
                    'is_active' => $isActive,
                ]);
                $schedule->forceFill(['transport_status_id' => $statusId]);
                $schedule->save();

                TransportScheduleItem::query()->updateOrCreate(
                    ['transport_schedule_id' => $schedule->id, 'waste_service_request_item_id' => $item->id],
                    [
                        'tenant_organization_id' => $gestor->id,
                        'waste_id' => $waste->id,
                        'scheduled_quantity' => 50,
                        'measurement_unit_id' => $kgMeasurementUnitId,
                        'is_active' => $isActive,
                    ],
                );

                $globalIndex++;
            }
        }
    }
}
