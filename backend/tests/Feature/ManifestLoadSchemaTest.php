<?php

use App\Models\Branch;
use App\Models\ManifestLoad;
use App\Models\ManifestLoadItem;
use App\Models\ManifestStatus;
use App\Models\Organization;
use App\Models\Person;
use App\Models\TransportPersonnel;
use App\Models\TransportSchedule;
use App\Models\TransportScheduleItem;
use App\Models\User;
use App\Models\Vehicle;
use App\Models\Waste;
use App\Models\WasteTreatmentApproval;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\PlatformOrganizationSeeder;
use Database\Seeders\RespelStatusSeeder;
use Illuminate\Database\QueryException;

// Constraints/relaciones del esquema nuevo del Módulo Manifiesto de Cargue,
// Fase 3 (D-MAN-01/D-MAN-03): manifest_statuses, manifest_loads,
// manifest_load_items.

beforeEach(function () {
    $this->seed(OrganizationStatusSeeder::class);
    $this->seed(PlatformOrganizationSeeder::class);
    // Requerido por WasteTreatmentApproval::creating() (respelStatusIdForCode)
    // -- ver test de approvedTreatment abajo.
    $this->seed(RespelStatusSeeder::class);
});

// ---------------------------------------------------------------------
// manifest_statuses (D-MAN-01)
// ---------------------------------------------------------------------

test('manifest_statuses rechaza un code duplicado bajo el mismo tenant_organization_id', function () {
    $platform = Organization::factory()->create();
    ManifestStatus::factory()->create(['tenant_organization_id' => $platform->id, 'code' => 'DRAFT']);

    expect(fn () => ManifestStatus::factory()->create(['tenant_organization_id' => $platform->id, 'code' => 'DRAFT']))
        ->toThrow(QueryException::class);
});

// ---------------------------------------------------------------------
// manifest_loads
// ---------------------------------------------------------------------

test('manifest_loads rechaza un manifest_number duplicado bajo la MISMA organización (D-MAN-03)', function () {
    $organization = Organization::factory()->create();
    ManifestLoad::factory()->create(['tenant_organization_id' => $organization->id, 'manifest_number' => 'MAN-000001']);

    expect(fn () => ManifestLoad::factory()->create(['tenant_organization_id' => $organization->id, 'manifest_number' => 'MAN-000001']))
        ->toThrow(QueryException::class);
});

test('manifest_loads permite el MISMO manifest_number en DISTINTAS organizaciones (D-MAN-03, único por organización, no global)', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    ManifestLoad::factory()->create(['tenant_organization_id' => $orgA->id, 'manifest_number' => 'MAN-000001']);

    expect(ManifestLoad::factory()->create(['tenant_organization_id' => $orgB->id, 'manifest_number' => 'MAN-000001']))
        ->not->toBeNull();
});

test('manifest_loads expone las relaciones de negocio (manifestStatus/transportSchedule/generatorBranch/carrierOrganization/vehicle/transportPersonnel/generatorSignerPerson/driverSignerPerson)', function () {
    $carrier = Organization::factory()->create();
    $vehicle = Vehicle::factory()->create(['organization_id' => $carrier->id]);
    $driver = TransportPersonnel::factory()->create(['organization_id' => $carrier->id]);
    $generatorSigner = Person::factory()->create();
    $driverSigner = Person::factory()->create();
    $schedule = TransportSchedule::factory()->create(['organization_id' => $carrier->id]);

    $manifest = ManifestLoad::factory()->create([
        'transport_schedule_id' => $schedule->id,
        'carrier_organization_id' => $carrier->id,
        'vehicle_id' => $vehicle->id,
        'transport_personnel_id' => $driver->id,
        'generator_signer_person_id' => $generatorSigner->id,
        'driver_signer_person_id' => $driverSigner->id,
    ]);

    expect($manifest->transportSchedule->is($schedule))->toBeTrue()
        ->and($manifest->carrierOrganization->is($carrier))->toBeTrue()
        ->and($manifest->vehicle->is($vehicle))->toBeTrue()
        ->and($manifest->transportPersonnel->is($driver))->toBeTrue()
        ->and($manifest->generatorSignerPerson->is($generatorSigner))->toBeTrue()
        ->and($manifest->driverSignerPerson->is($driverSigner))->toBeTrue()
        ->and($manifest->manifestStatus)->not->toBeNull()
        ->and($manifest->generatorBranch)->not->toBeNull();
});

test('manifest_loads no permite borrar el transport_schedule referenciado (RESTRICT)', function () {
    $schedule = TransportSchedule::factory()->create();
    ManifestLoad::factory()->create(['transport_schedule_id' => $schedule->id]);

    expect(fn () => $schedule->forceDelete())->toThrow(QueryException::class);
});

test('manifest_loads no permite borrar la persona firmante del generador/conductor (RESTRICT)', function () {
    $generatorSigner = Person::factory()->create();
    ManifestLoad::factory()->create(['generator_signer_person_id' => $generatorSigner->id]);

    expect(fn () => $generatorSigner->forceDelete())->toThrow(QueryException::class);
});

test('manifest_loads.isAccessibleBy(): la organización transportadora, la organización generadora y platform staff tienen acceso; una tercera organización no', function () {
    $carrier = Organization::factory()->create();
    $generator = Organization::factory()->create();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $manifest = ManifestLoad::factory()->create([
        'carrier_organization_id' => $carrier->id,
        'generator_branch_id' => $branch->id,
    ]);

    $carrierActor = User::factory()->create(['tenant_organization_id' => $carrier->id]);
    $generatorActor = User::factory()->create(['tenant_organization_id' => $generator->id]);
    $foreignActor = User::factory()->create(['tenant_organization_id' => Organization::factory()->create()->id]);
    $platformActor = User::factory()->create(['tenant_organization_id' => Organization::query()->where('is_platform_tenant', true)->firstOrFail()->id]);

    expect($manifest->isAccessibleBy($carrierActor))->toBeTrue()
        ->and($manifest->isAccessibleBy($generatorActor))->toBeTrue()
        ->and($manifest->isAccessibleBy($foreignActor))->toBeFalse()
        ->and($manifest->isAccessibleBy($platformActor))->toBeTrue();
});

// ---------------------------------------------------------------------
// manifest_load_items
// ---------------------------------------------------------------------

test('borrar un manifest_load borra en cascada sus manifest_load_items (cascadeOnDelete)', function () {
    $manifest = ManifestLoad::factory()->create();
    $item = ManifestLoadItem::factory()->create(['manifest_load_id' => $manifest->id]);

    $manifest->forceDelete();

    expect(ManifestLoadItem::query()->find($item->id))->toBeNull();
});

test('manifest_load_items no permite borrar el waste referenciado (RESTRICT)', function () {
    $waste = Waste::factory()->create();
    ManifestLoadItem::factory()->create(['waste_id' => $waste->id]);

    expect(fn () => $waste->forceDelete())->toThrow(QueryException::class);
});

test('manifest_load_items expone las relaciones manifestLoad/transportScheduleItem/waste/approvedTreatment', function () {
    $manifest = ManifestLoad::factory()->create();
    $scheduleItem = TransportScheduleItem::factory()->create();
    $waste = Waste::factory()->create();
    $approval = WasteTreatmentApproval::factory()->viable()->create();

    $item = ManifestLoadItem::factory()->create([
        'manifest_load_id' => $manifest->id,
        'transport_schedule_item_id' => $scheduleItem->id,
        'waste_id' => $waste->id,
        'approved_treatment_id' => $approval->id,
    ]);

    expect($item->manifestLoad->is($manifest))->toBeTrue()
        ->and($item->transportScheduleItem->is($scheduleItem))->toBeTrue()
        ->and($item->waste->is($waste))->toBeTrue()
        ->and($item->approvedTreatment->is($approval))->toBeTrue();

    $manifest->refresh();
    expect($manifest->items)->toHaveCount(1);
});
