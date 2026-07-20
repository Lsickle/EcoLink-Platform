<?php

use App\Models\ManifestLoad;
use App\Models\ManifestLoadItem;
use App\Models\ManifestUnload;
use App\Models\ManifestUnloadItem;
use App\Models\Organization;
use App\Models\Person;
use App\Models\TransportPersonnel;
use App\Models\UnloadRequest;
use App\Models\UnloadRequestItem;
use App\Models\User;
use App\Models\Vehicle;
use App\Models\Waste;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\PlatformOrganizationSeeder;
use Database\Seeders\RespelStatusSeeder;
use Illuminate\Database\QueryException;

// Constraints/relaciones del esquema nuevo del Módulo Manifiesto de
// Descargue, Fase 5: manifest_unloads, manifest_unload_items.

beforeEach(function () {
    $this->seed(OrganizationStatusSeeder::class);
    $this->seed(PlatformOrganizationSeeder::class);
    $this->seed(RespelStatusSeeder::class);
});

// ---------------------------------------------------------------------
// manifest_unloads
// ---------------------------------------------------------------------

test('manifest_unloads rechaza un manifest_number duplicado bajo la MISMA organización (D-MAN-03)', function () {
    $organization = Organization::factory()->create();
    ManifestUnload::factory()->create(['tenant_organization_id' => $organization->id, 'manifest_number' => 'MUN-000001']);

    expect(fn () => ManifestUnload::factory()->create(['tenant_organization_id' => $organization->id, 'manifest_number' => 'MUN-000001']))
        ->toThrow(QueryException::class);
});

test('manifest_unloads permite el MISMO manifest_number en DISTINTAS organizaciones', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    ManifestUnload::factory()->create(['tenant_organization_id' => $orgA->id, 'manifest_number' => 'MUN-000001']);

    expect(ManifestUnload::factory()->create(['tenant_organization_id' => $orgB->id, 'manifest_number' => 'MUN-000001']))
        ->not->toBeNull();
});

test('manifest_unloads permite manifest_number NULL (D-RCP-14, numeración diferida bajo captura offline)', function () {
    expect(ManifestUnload::factory()->create(['manifest_number' => null]))->not->toBeNull();
    expect(ManifestUnload::factory()->create(['manifest_number' => null]))->not->toBeNull();
});

test('manifest_unloads rechaza (CHECK constraint) manifest_load_id y unload_request_id AMBOS NULL', function () {
    expect(fn () => ManifestUnload::factory()->create(['manifest_load_id' => null, 'unload_request_id' => null]))
        ->toThrow(QueryException::class);
});

test('manifest_unloads permite manifest_load_id NULL cuando unload_request_id está presente (D-PRG-05)', function () {
    $unloadRequest = UnloadRequest::factory()->create();

    expect(ManifestUnload::factory()->create(['manifest_load_id' => null, 'unload_request_id' => $unloadRequest->id]))
        ->not->toBeNull();
});

test('manifest_unloads permite unload_request_id NULL cuando manifest_load_id está presente (D-PRG-05)', function () {
    $manifestLoad = ManifestLoad::factory()->create();

    expect(ManifestUnload::factory()->create(['manifest_load_id' => $manifestLoad->id, 'unload_request_id' => null]))
        ->not->toBeNull();
});

test('manifest_unloads expone las relaciones de negocio', function () {
    $receivingOrganization = Organization::factory()->create();
    $vehicle = Vehicle::factory()->create(['organization_id' => $receivingOrganization->id]);
    $driver = TransportPersonnel::factory()->create();
    $receiverSigner = Person::factory()->create();
    $driverSigner = Person::factory()->create();
    $unloadRequest = UnloadRequest::factory()->create();

    $manifest = ManifestUnload::factory()->create([
        'unload_request_id' => $unloadRequest->id,
        'receiving_organization_id' => $receivingOrganization->id,
        'vehicle_id' => $vehicle->id,
        'transport_personnel_id' => $driver->id,
        'receiver_person_id' => $receiverSigner->id,
        'driver_signer_person_id' => $driverSigner->id,
    ]);

    expect($manifest->unloadRequest->is($unloadRequest))->toBeTrue()
        ->and($manifest->receivingOrganization->is($receivingOrganization))->toBeTrue()
        ->and($manifest->vehicle->is($vehicle))->toBeTrue()
        ->and($manifest->transportPersonnel->is($driver))->toBeTrue()
        ->and($manifest->receiverPerson->is($receiverSigner))->toBeTrue()
        ->and($manifest->driverSignerPerson->is($driverSigner))->toBeTrue()
        ->and($manifest->manifestStatus)->not->toBeNull()
        ->and($manifest->receivingBranch)->not->toBeNull();
});

test('manifest_unloads no permite borrar la persona firmante del receptor/conductor (RESTRICT)', function () {
    $receiverSigner = Person::factory()->create();
    ManifestUnload::factory()->create(['receiver_person_id' => $receiverSigner->id]);

    expect(fn () => $receiverSigner->forceDelete())->toThrow(QueryException::class);
});

test('manifest_unloads.isAccessibleBy(): la organización receptora, el lado transportador de la unload_request y platform staff tienen acceso; una tercera organización no', function () {
    $receivingOrganization = Organization::factory()->create();
    $carrierOrganization = Organization::factory()->create();
    $unloadRequest = UnloadRequest::factory()->create(['carrier_organization_id' => $carrierOrganization->id]);

    $manifest = ManifestUnload::factory()->create([
        'unload_request_id' => $unloadRequest->id,
        'receiving_organization_id' => $receivingOrganization->id,
    ]);

    $receiverActor = User::factory()->create(['tenant_organization_id' => $receivingOrganization->id]);
    $carrierActor = User::factory()->create(['tenant_organization_id' => $carrierOrganization->id]);
    $foreignActor = User::factory()->create(['tenant_organization_id' => Organization::factory()->create()->id]);
    $platformActor = User::factory()->create(['tenant_organization_id' => Organization::query()->where('is_platform_tenant', true)->firstOrFail()->id]);

    expect($manifest->isAccessibleBy($receiverActor))->toBeTrue()
        ->and($manifest->isAccessibleBy($carrierActor))->toBeTrue()
        ->and($manifest->isAccessibleBy($foreignActor))->toBeFalse()
        ->and($manifest->isAccessibleBy($platformActor))->toBeTrue();
});

// ---------------------------------------------------------------------
// manifest_unload_items
// ---------------------------------------------------------------------

test('borrar un manifest_unload borra en cascada sus manifest_unload_items (cascadeOnDelete)', function () {
    $manifest = ManifestUnload::factory()->create();
    $item = ManifestUnloadItem::factory()->create(['manifest_unload_id' => $manifest->id]);

    $manifest->forceDelete();

    expect(ManifestUnloadItem::query()->find($item->id))->toBeNull();
});

test('manifest_unload_items no permite borrar el waste referenciado (RESTRICT)', function () {
    $waste = Waste::factory()->create();
    ManifestUnloadItem::factory()->create(['waste_id' => $waste->id]);

    expect(fn () => $waste->forceDelete())->toThrow(QueryException::class);
});

test('manifest_unload_items expone las relaciones manifestUnload/manifestLoadItem/unloadRequestItem/waste', function () {
    $manifest = ManifestUnload::factory()->create();
    $manifestLoadItem = ManifestLoadItem::factory()->create();
    $unloadRequestItem = UnloadRequestItem::factory()->create();
    $waste = Waste::factory()->create();

    $item = ManifestUnloadItem::factory()->create([
        'manifest_unload_id' => $manifest->id,
        'manifest_load_item_id' => $manifestLoadItem->id,
        'unload_request_item_id' => $unloadRequestItem->id,
        'waste_id' => $waste->id,
    ]);

    expect($item->manifestUnload->is($manifest))->toBeTrue()
        ->and($item->manifestLoadItem->is($manifestLoadItem))->toBeTrue()
        ->and($item->unloadRequestItem->is($unloadRequestItem))->toBeTrue()
        ->and($item->waste->is($waste))->toBeTrue();

    $manifest->refresh();
    expect($manifest->items)->toHaveCount(1);
});
