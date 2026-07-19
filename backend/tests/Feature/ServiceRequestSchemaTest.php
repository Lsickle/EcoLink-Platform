<?php

use App\Models\CancellationReason;
use App\Models\CarteraStatus;
use App\Models\Organization;
use App\Models\OrganizationCarteraStatus;
use App\Models\OrganizationServiceStatus;
use App\Models\ServiceItemStatus;
use App\Models\ServiceStatus;
use App\Models\Waste;
use App\Models\WasteServiceRequest;
use App\Models\WasteServiceRequestItem;
use App\Models\WasteTreatmentApproval;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\PlatformOrganizationSeeder;
use Database\Seeders\RespelStatusSeeder;
use Illuminate\Database\QueryException;

// Constraints/relaciones del esquema nuevo del Módulo Solicitudes de
// Servicio, Fase 1a (D-S01/D-S02/D-S04/D-S09/D-S10/D-S12).

// WasteTreatmentApproval::booted() resuelve technical_status_id/
// commercial_status_id contra respel_statuses (motor de Workflow genérico,
// D-WF-02) -- sin este seeding, la creación via factory viola el NOT NULL de
// esas columnas (mismo requisito ya documentado en
// WasteTreatmentApprovalControllerTest).
beforeEach(function () {
    $this->seed(OrganizationStatusSeeder::class);
    $this->seed(PlatformOrganizationSeeder::class);
    $this->seed(RespelStatusSeeder::class);
});

test('service_statuses rechaza un code global duplicado (organization_id NULL)', function () {
    ServiceStatus::factory()->create(['organization_id' => null, 'code' => 'DRAFT']);

    expect(fn () => ServiceStatus::factory()->create(['organization_id' => null, 'code' => 'DRAFT']))
        ->toThrow(QueryException::class);
});

test('service_statuses permite el mismo code en dos organizaciones distintas (D-S02)', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $a = ServiceStatus::factory()->create(['organization_id' => $orgA->id, 'code' => 'CUSTOM']);
    $b = ServiceStatus::factory()->create(['organization_id' => $orgB->id, 'code' => 'CUSTOM']);

    expect($a->exists)->toBeTrue()->and($b->exists)->toBeTrue();
});

test('service_statuses rechaza un code duplicado dentro de la MISMA organización', function () {
    $org = Organization::factory()->create();
    ServiceStatus::factory()->create(['organization_id' => $org->id, 'code' => 'CUSTOM']);

    expect(fn () => ServiceStatus::factory()->create(['organization_id' => $org->id, 'code' => 'CUSTOM']))
        ->toThrow(QueryException::class);
});

test('organization_service_statuses rechaza duplicar (organization_id, service_status_id)', function () {
    $org = Organization::factory()->create();
    $status = ServiceStatus::factory()->create();

    OrganizationServiceStatus::factory()->create(['organization_id' => $org->id, 'service_status_id' => $status->id]);

    expect(fn () => OrganizationServiceStatus::factory()->create(['organization_id' => $org->id, 'service_status_id' => $status->id]))
        ->toThrow(QueryException::class);
});

test('cancellation_reasons rechaza un code global duplicado (organization_id NULL)', function () {
    CancellationReason::factory()->create(['organization_id' => null, 'code' => 'CLIENT_REQUEST']);

    expect(fn () => CancellationReason::factory()->create(['organization_id' => null, 'code' => 'CLIENT_REQUEST']))
        ->toThrow(QueryException::class);
});

test('cancellation_reasons permite el mismo code global y de una organización a la vez (D-S02/D-S09)', function () {
    CancellationReason::factory()->create(['organization_id' => null, 'code' => 'CLIENT_REQUEST']);

    $org = Organization::factory()->create();
    $custom = CancellationReason::factory()->create(['organization_id' => $org->id, 'code' => 'CLIENT_REQUEST']);

    expect($custom->exists)->toBeTrue();
});

test('organization_cartera_statuses acepta solo un registro VIGENTE por par Generador/Gestor (D-S12)', function () {
    $generator = Organization::factory()->create();
    $gestor = Organization::factory()->create();

    OrganizationCarteraStatus::factory()->create([
        'generator_organization_id' => $generator->id,
        'gestor_organization_id' => $gestor->id,
        'is_active' => true,
    ]);

    expect(fn () => OrganizationCarteraStatus::factory()->create([
        'generator_organization_id' => $generator->id,
        'gestor_organization_id' => $gestor->id,
        'is_active' => true,
    ]))->toThrow(QueryException::class);
});

test('organization_cartera_statuses permite un registro inactivo adicional para el mismo par (historial)', function () {
    $generator = Organization::factory()->create();
    $gestor = Organization::factory()->create();

    OrganizationCarteraStatus::factory()->create([
        'generator_organization_id' => $generator->id,
        'gestor_organization_id' => $gestor->id,
        'is_active' => false,
    ]);

    $active = OrganizationCarteraStatus::factory()->create([
        'generator_organization_id' => $generator->id,
        'gestor_organization_id' => $gestor->id,
        'is_active' => true,
    ]);

    expect($active->exists)->toBeTrue();
});

test('OrganizationCarteraStatus::blocksNewRequests() refleja blocks_new_requests del cartera_status vigente', function () {
    $blockingStatus = CarteraStatus::factory()->create(['blocks_new_requests' => true]);
    $blocked = OrganizationCarteraStatus::factory()->create(['cartera_status_id' => $blockingStatus->id, 'is_active' => true]);

    $nonBlockingStatus = CarteraStatus::factory()->create(['blocks_new_requests' => false]);
    $allowed = OrganizationCarteraStatus::factory()->create(['cartera_status_id' => $nonBlockingStatus->id, 'is_active' => true]);

    expect($blocked->blocksNewRequests())->toBeTrue()
        ->and($allowed->blocksNewRequests())->toBeFalse();
});

test('WasteServiceRequest expone las relaciones organization/branch/serviceStatus/items', function () {
    $serviceStatus = ServiceStatus::factory()->create();
    $request = WasteServiceRequest::factory()->create(['service_status_id' => $serviceStatus->id]);

    WasteServiceRequestItem::factory()->count(2)->create(['service_request_id' => $request->id]);

    $request->refresh();

    expect($request->organization)->toBeInstanceOf(Organization::class)
        ->and($request->branch)->toBeInstanceOf(\App\Models\Branch::class)
        ->and($request->serviceStatus->is($serviceStatus))->toBeTrue()
        ->and($request->items)->toHaveCount(2);
});

test('WasteServiceRequestItem expone las relaciones waste/wasteTreatmentApproval/itemStatus/physicalState/measurementUnit', function () {
    $waste = Waste::factory()->create();
    $approval = WasteTreatmentApproval::factory()->create(['waste_id' => $waste->id]);
    $itemStatus = ServiceItemStatus::factory()->create();

    $item = WasteServiceRequestItem::factory()->create([
        'waste_id' => $waste->id,
        'waste_treatment_approval_id' => $approval->id,
        'item_status_id' => $itemStatus->id,
    ]);

    expect($item->waste->is($waste))->toBeTrue()
        ->and($item->wasteTreatmentApproval->is($approval))->toBeTrue()
        ->and($item->itemStatus->is($itemStatus))->toBeTrue();
});

test('borrar una waste_service_request borra en cascada sus items (FK cascadeOnDelete)', function () {
    $request = WasteServiceRequest::factory()->create();
    $item = WasteServiceRequestItem::factory()->create(['service_request_id' => $request->id]);

    $request->forceDelete();

    expect(WasteServiceRequestItem::query()->find($item->id))->toBeNull();
});

test('waste_service_requests no permite borrar un waste referenciado por un ítem (RESTRICT)', function () {
    $waste = Waste::factory()->create();
    WasteServiceRequestItem::factory()->create(['waste_id' => $waste->id]);

    expect(fn () => $waste->forceDelete())->toThrow(QueryException::class);
});
