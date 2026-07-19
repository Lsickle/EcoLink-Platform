<?php

use App\Models\Branch;
use App\Models\Organization;
use App\Models\Person;
use App\Models\TransportPersonnel;
use App\Models\TransportRoute;
use App\Models\TransportRouteStop;
use App\Models\TransportSchedule;
use App\Models\TransportScheduleItem;
use App\Models\TransportStatus;
use App\Models\Vehicle;
use App\Models\Waste;
use App\Models\WasteServiceRequestItem;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\PlatformOrganizationSeeder;
use Illuminate\Database\QueryException;

// Constraints/relaciones del esquema nuevo del Módulo Programación
// Logística, Fase 2a (D-PRG-01 a D-PRG-14): transport_personnel,
// transport_statuses, transport_schedules, transport_schedule_items,
// transport_routes, transport_route_stops.

beforeEach(function () {
    $this->seed(OrganizationStatusSeeder::class);
    $this->seed(PlatformOrganizationSeeder::class);
});

// ---------------------------------------------------------------------
// transport_personnel (esquema-bd hallazgo #7, "Conductor 1:1 de people")
// ---------------------------------------------------------------------

test('transport_personnel exige person_id único (1:1 con people)', function () {
    $person = Person::factory()->create();
    TransportPersonnel::factory()->create(['person_id' => $person->id]);

    expect(fn () => TransportPersonnel::factory()->create(['person_id' => $person->id]))
        ->toThrow(QueryException::class);
});

test('transport_personnel expone las relaciones organization/person', function () {
    $organization = Organization::factory()->create();
    $person = Person::factory()->create();

    $driver = TransportPersonnel::factory()->create([
        'organization_id' => $organization->id,
        'person_id' => $person->id,
    ]);

    expect($driver->organization->is($organization))->toBeTrue()
        ->and($driver->person->is($person))->toBeTrue();
});

test('transport_personnel no permite borrar la organización transportadora referenciada (RESTRICT, RN-090/091)', function () {
    $organization = Organization::factory()->create();
    TransportPersonnel::factory()->create(['organization_id' => $organization->id]);

    expect(fn () => $organization->forceDelete())->toThrow(QueryException::class);
});

// ---------------------------------------------------------------------
// transport_statuses
// ---------------------------------------------------------------------

test('transport_statuses rechaza un code duplicado bajo el mismo tenant_organization_id', function () {
    $platform = Organization::factory()->create();
    TransportStatus::factory()->create(['tenant_organization_id' => $platform->id, 'code' => 'BOR']);

    expect(fn () => TransportStatus::factory()->create(['tenant_organization_id' => $platform->id, 'code' => 'BOR']))
        ->toThrow(QueryException::class);
});

// ---------------------------------------------------------------------
// transport_schedules -- D-PRG-03: vehicle_id/transport_personnel_id NUNCA null
// ---------------------------------------------------------------------

test('transport_schedules rechaza vehicle_id NULL (D-PRG-03, ninguna modalidad admite excepción)', function () {
    expect(fn () => TransportSchedule::factory()->create(['vehicle_id' => null]))
        ->toThrow(QueryException::class);
});

test('transport_schedules rechaza transport_personnel_id NULL (D-PRG-03, ninguna modalidad admite excepción)', function () {
    expect(fn () => TransportSchedule::factory()->create(['transport_personnel_id' => null]))
        ->toThrow(QueryException::class);
});

test('transport_schedules rechaza un schedule_number duplicado', function () {
    TransportSchedule::factory()->create(['schedule_number' => 'PRG-000001']);

    expect(fn () => TransportSchedule::factory()->create(['schedule_number' => 'PRG-000001']))
        ->toThrow(QueryException::class);
});

test('transport_schedules expone las relaciones de negocio (organization/wasteServiceRequest/transportStatus/vehicle/transportPersonnel/branches)', function () {
    $organization = Organization::factory()->create();
    $vehicle = Vehicle::factory()->create(['organization_id' => $organization->id]);
    $driver = TransportPersonnel::factory()->create(['organization_id' => $organization->id]);
    $sourceBranch = Branch::factory()->create();
    $destinationBranch = Branch::factory()->create();

    $schedule = TransportSchedule::factory()->create([
        'organization_id' => $organization->id,
        'vehicle_id' => $vehicle->id,
        'transport_personnel_id' => $driver->id,
        'source_branch_id' => $sourceBranch->id,
        'destination_branch_id' => $destinationBranch->id,
    ]);

    expect($schedule->organization->is($organization))->toBeTrue()
        ->and($schedule->vehicle->is($vehicle))->toBeTrue()
        ->and($schedule->transportPersonnel->is($driver))->toBeTrue()
        ->and($schedule->sourceBranch->is($sourceBranch))->toBeTrue()
        ->and($schedule->destinationBranch->is($destinationBranch))->toBeTrue()
        ->and($schedule->wasteServiceRequest)->not->toBeNull()
        ->and($schedule->transportStatus)->not->toBeNull();
});

test('transport_schedules no permite borrar el vehículo asignado mientras exista la programación (RESTRICT, D-PRG-03)', function () {
    $vehicle = Vehicle::factory()->create();
    TransportSchedule::factory()->create(['vehicle_id' => $vehicle->id]);

    expect(fn () => $vehicle->forceDelete())->toThrow(QueryException::class);
});

test('transport_schedules soporta auto-referencia parent_schedule_id (CU-027 Reprogramar)', function () {
    $original = TransportSchedule::factory()->create(['version_number' => 1]);
    $reprogrammed = TransportSchedule::factory()->create([
        'parent_schedule_id' => $original->id,
        'version_number' => 2,
    ]);

    expect($reprogrammed->parentSchedule->is($original))->toBeTrue()
        ->and($original->childSchedules)->toHaveCount(1)
        ->and($original->childSchedules->first()->is($reprogrammed))->toBeTrue();
});

// ---------------------------------------------------------------------
// transport_schedule_items (tabla puente N:1 -- varios ítems por programación)
// ---------------------------------------------------------------------

test('borrar una transport_schedule borra en cascada sus transport_schedule_items (cascadeOnDelete)', function () {
    $schedule = TransportSchedule::factory()->create();
    $item = TransportScheduleItem::factory()->create(['transport_schedule_id' => $schedule->id]);

    $schedule->forceDelete();

    expect(TransportScheduleItem::query()->find($item->id))->toBeNull();
});

test('transport_schedule_items no permite borrar el waste referenciado (RESTRICT)', function () {
    $waste = Waste::factory()->create();
    TransportScheduleItem::factory()->create(['waste_id' => $waste->id]);

    expect(fn () => $waste->forceDelete())->toThrow(QueryException::class);
});

test('transport_schedule_items expone las relaciones transportSchedule/wasteServiceRequestItem/waste', function () {
    $schedule = TransportSchedule::factory()->create();
    $requestItem = WasteServiceRequestItem::factory()->create();
    $waste = Waste::factory()->create();

    $item = TransportScheduleItem::factory()->create([
        'transport_schedule_id' => $schedule->id,
        'waste_service_request_item_id' => $requestItem->id,
        'waste_id' => $waste->id,
    ]);

    expect($item->transportSchedule->is($schedule))->toBeTrue()
        ->and($item->wasteServiceRequestItem->is($requestItem))->toBeTrue()
        ->and($item->waste->is($waste))->toBeTrue();

    $schedule->refresh();
    expect($schedule->items)->toHaveCount(1);
});

// ---------------------------------------------------------------------
// transport_routes / transport_route_stops (agrupación mínima, sin motor
// de optimización real)
// ---------------------------------------------------------------------

test('transport_route_stops rechaza que la misma transport_schedule tenga 2 paradas (UNIQUE transport_schedule_id)', function () {
    $schedule = TransportSchedule::factory()->create();
    TransportRouteStop::factory()->create(['transport_schedule_id' => $schedule->id, 'stop_sequence' => 1]);

    expect(fn () => TransportRouteStop::factory()->create(['transport_schedule_id' => $schedule->id, 'stop_sequence' => 2]))
        ->toThrow(QueryException::class);
});

test('transport_route_stops rechaza 2 paradas con el mismo stop_sequence dentro de la misma ruta', function () {
    $route = TransportRoute::factory()->create();
    TransportRouteStop::factory()->create(['transport_route_id' => $route->id, 'stop_sequence' => 1]);

    expect(fn () => TransportRouteStop::factory()->create(['transport_route_id' => $route->id, 'stop_sequence' => 1]))
        ->toThrow(QueryException::class);
});

test('transport_routes agrupa varias transport_schedules en orden de parada', function () {
    $route = TransportRoute::factory()->create();
    $first = TransportSchedule::factory()->create();
    $second = TransportSchedule::factory()->create();

    TransportRouteStop::factory()->create(['transport_route_id' => $route->id, 'transport_schedule_id' => $first->id, 'stop_sequence' => 1]);
    TransportRouteStop::factory()->create(['transport_route_id' => $route->id, 'transport_schedule_id' => $second->id, 'stop_sequence' => 2]);

    $route->refresh();

    expect($route->stops)->toHaveCount(2)
        ->and($route->stops->sortBy('stop_sequence')->pluck('transport_schedule_id')->values()->all())
        ->toBe([$first->id, $second->id]);
});

test('borrar una transport_route no borra las transport_schedules agrupadas, solo la parada (cascadeOnDelete en la pivote, no en el recurso)', function () {
    $route = TransportRoute::factory()->create();
    $schedule = TransportSchedule::factory()->create();
    TransportRouteStop::factory()->create(['transport_route_id' => $route->id, 'transport_schedule_id' => $schedule->id]);

    $route->forceDelete();

    expect(TransportRouteStop::query()->count())->toBe(0)
        ->and(TransportSchedule::query()->find($schedule->id))->not->toBeNull();
});
