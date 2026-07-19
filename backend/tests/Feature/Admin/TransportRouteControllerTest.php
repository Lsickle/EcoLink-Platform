<?php

use App\Models\Branch;
use App\Models\BusinessRole;
use App\Models\Organization;
use App\Models\OrganizationBusinessRole;
use App\Models\Role;
use App\Models\ServiceItemStatus;
use App\Models\TransportPersonnel;
use App\Models\TransportRoute;
use App\Models\User;
use App\Models\UserRole;
use App\Models\Vehicle;
use App\Models\Waste;
use App\Models\WasteServiceRequest;
use App\Models\WasteServiceRequestItem;
use App\Models\WasteTreatmentApproval;
use Database\Seeders\BusinessRoleSeeder;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\PlatformOrganizationSeeder;
use Database\Seeders\RespelStatusSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;
use Database\Seeders\ServiceItemStatusSeeder;
use Database\Seeders\ServiceStatusSeeder;
use Database\Seeders\TransportScheduleWorkflowSeeder;
use Database\Seeders\TransportStatusSeeder;

// CRUD MÍNIMO de Rutas (`transport_routes`, CU-059) -- gap real de contrato
// detectado por el agente de frontend, mismo patrón de fixtures que
// TransportScheduleControllerTest/TransportPersonnelControllerTest
// (prefijo `tr`). A diferencia de `transport_personnel` (donde LOGÍSTICA es
// solo lectura), `transport_routes.create` SÍ está en LOGÍSTICA (mismo
// criterio que `transport_schedules.*`, ver RolePermissionSeeder).
beforeEach(function () {
    $this->seed(OrganizationStatusSeeder::class);
    $this->seed(PlatformOrganizationSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->seed(PermissionSeeder::class);
    $this->seed(RolePermissionSeeder::class);
    $this->seed(BusinessRoleSeeder::class);
});

function trActor(?string $roleCode = null, ?int $tenantOrganizationId = null): User
{
    $actor = User::factory()->create(['tenant_organization_id' => $tenantOrganizationId]);

    if ($roleCode !== null) {
        $role = Role::query()->where('code', $roleCode)->firstOrFail();

        UserRole::query()->create(['user_id' => $actor->id, 'role_id' => $role->id, 'is_active' => true]);
    }

    return $actor;
}

function trLogisticaActor(?int $tenantOrganizationId = null): User
{
    return trActor('LOGÍSTICA', $tenantOrganizationId);
}

function trPlatformStaffActor(): User
{
    $platform = Organization::query()->where('is_platform_tenant', true)->first()
        ?? Organization::factory()->create(['is_platform_tenant' => true]);

    return trActor('ADMINISTRADOR', $platform->id);
}

function trGestorOrganization(): Organization
{
    $organization = Organization::factory()->create();
    $gestor = BusinessRole::query()->where('code', 'GESTOR')->firstOrFail();

    OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id,
        'business_role_id' => $gestor->id,
        'assigned_at' => now(),
        'is_active' => true,
    ]);

    return $organization->fresh();
}

// ---- store(): creación válida + anti-IDOR ----

test('store crea una ruta en la organización actora con route_code generado server-side', function () {
    $gestor = trGestorOrganization();
    $actor = trLogisticaActor($gestor->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/transport-routes', [
        'name' => 'Ruta Norte',
        'route_date' => now()->addDay()->toDateString(),
        'observations' => 'Zona industrial norte',
    ])->assertCreated();

    $response->assertJsonPath('transport_route.organization_id', $gestor->id)
        ->assertJsonPath('transport_route.name', 'Ruta Norte')
        ->assertJsonPath('transport_route.is_active', true);

    expect($response->json('transport_route.route_code'))->not->toBeNull();
    expect(TransportRoute::query()->count())->toBe(1);
});

test('store rechaza cuando la organización actora NO tiene la capacidad can_transport_waste', function () {
    $generator = Organization::factory()->create();
    $generatorRole = BusinessRole::query()->where('code', 'GENERATOR')->firstOrFail();
    OrganizationBusinessRole::query()->create([
        'organization_id' => $generator->id,
        'business_role_id' => $generatorRole->id,
        'assigned_at' => now(),
        'is_active' => true,
    ]);

    $actor = trLogisticaActor($generator->id);

    $this->actingAs($actor)->postJson('/api/admin/transport-routes', ['name' => 'Ruta Sur'])
        ->assertForbidden();

    expect(TransportRoute::query()->count())->toBe(0);
});

test('platform staff puede crear una ruta especificando organization_id', function () {
    $gestor = trGestorOrganization();
    $actor = trPlatformStaffActor();

    $response = $this->actingAs($actor)->postJson('/api/admin/transport-routes', [
        'organization_id' => $gestor->id,
        'name' => 'Ruta Centro',
    ])->assertCreated();

    $response->assertJsonPath('transport_route.organization_id', $gestor->id);
});

test('store rechaza sin el permiso transport_routes.create', function () {
    $gestor = trGestorOrganization();
    $actor = trActor(null, $gestor->id);

    $this->actingAs($actor)->postJson('/api/admin/transport-routes', ['name' => 'Ruta X'])
        ->assertForbidden();
});

// ---- index()/show(): aislamiento tenant-vs-platform-staff ----

test('index(): una organización ve SOLO sus propias rutas; platform staff ve todas', function () {
    $gestorA = trGestorOrganization();
    $routeA = TransportRoute::factory()->create(['organization_id' => $gestorA->id]);

    $gestorB = trGestorOrganization();
    TransportRoute::factory()->create(['organization_id' => $gestorB->id]);

    $actorA = trLogisticaActor($gestorA->id);
    $viewA = $this->actingAs($actorA)->getJson('/api/admin/transport-routes')->assertOk();
    expect($viewA->json('total'))->toBe(1)
        ->and(collect($viewA->json('data'))->pluck('id'))->toContain($routeA->id);

    $platformActor = trPlatformStaffActor();
    $allView = $this->actingAs($platformActor)->getJson('/api/admin/transport-routes')->assertOk();
    expect($allView->json('total'))->toBe(2);
});

test('show(): una organización ajena recibe 403 (IDOR)', function () {
    $gestor = trGestorOrganization();
    $route = TransportRoute::factory()->create(['organization_id' => $gestor->id]);

    $foreignOrganization = trGestorOrganization();
    $foreignActor = trLogisticaActor($foreignOrganization->id);

    $this->actingAs($foreignActor)
        ->getJson("/api/admin/transport-routes/{$route->id}")
        ->assertForbidden();
});

test('todos los endpoints devuelven 403 sin ningún rol/permiso transport_routes.* asignado', function () {
    $gestor = trGestorOrganization();
    $route = TransportRoute::factory()->create(['organization_id' => $gestor->id]);
    $actor = trActor(null, $gestor->id);

    $this->actingAs($actor)->getJson('/api/admin/transport-routes')->assertForbidden();
    $this->actingAs($actor)->postJson('/api/admin/transport-routes', [])->assertForbidden();
    $this->actingAs($actor)->getJson("/api/admin/transport-routes/{$route->id}")->assertForbidden();
});

// ---- flujo feliz completo: crear ruta -> asignar programaciones (assignToRoute ya existente) ----

test('una ruta recién creada puede recibir programaciones vía TransportScheduleController::assignToRoute()', function () {
    $this->seed(RespelStatusSeeder::class);
    $this->seed(ServiceStatusSeeder::class);
    $this->seed(ServiceItemStatusSeeder::class);
    $this->seed(TransportStatusSeeder::class);
    $this->seed(TransportScheduleWorkflowSeeder::class);

    $generator = Organization::factory()->create();
    $generatorRole = BusinessRole::query()->where('code', 'GENERATOR')->firstOrFail();
    OrganizationBusinessRole::query()->create([
        'organization_id' => $generator->id, 'business_role_id' => $generatorRole->id, 'assigned_at' => now(), 'is_active' => true,
    ]);

    $gestor = trGestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);

    $waste = Waste::factory()->create(['organization_id' => $generator->id]);
    $approval = WasteTreatmentApproval::factory()->viable()->create(['organization_id' => $gestor->id, 'waste_id' => $waste->id]);
    $serviceRequest = WasteServiceRequest::factory()->create(['organization_id' => $generator->id, 'branch_id' => $branch->id]);
    $acceptedStatusId = ServiceItemStatus::query()->where('code', 'ACCEPTED')->value('id');
    $item = WasteServiceRequestItem::factory()->create([
        'service_request_id' => $serviceRequest->id, 'waste_id' => $waste->id,
        'waste_treatment_approval_id' => $approval->id, 'item_status_id' => $acceptedStatusId,
    ]);

    $vehicle = Vehicle::factory()->create(['organization_id' => $gestor->id]);
    $driver = TransportPersonnel::factory()->create(['organization_id' => $gestor->id]);

    $actor = trActor('LOGÍSTICA', $gestor->id);

    $routeResponse = $this->actingAs($actor)->postJson('/api/admin/transport-routes', ['name' => 'Ruta Integración'])->assertCreated();
    $routeId = $routeResponse->json('transport_route.id');

    $scheduleResponse = $this->actingAs($actor)->postJson('/api/admin/transport-schedules', [
        'waste_service_request_id' => $serviceRequest->id,
        'vehicle_id' => $vehicle->id,
        'transport_personnel_id' => $driver->id,
        'source_branch_id' => $branch->id,
        'destination_branch_id' => Branch::factory()->create(['organization_id' => $gestor->id])->id,
        'scheduled_pickup_at' => now()->addDay()->toIso8601String(),
        'items' => [['waste_service_request_item_id' => $item->id, 'scheduled_quantity' => 10]],
    ])->assertCreated();

    $this->actingAs($actor)->postJson("/api/admin/transport-schedules/{$scheduleResponse->json('transport_schedule.id')}/route", [
        'transport_route_id' => $routeId,
    ])->assertOk()->assertJsonPath('route_stop.stop_sequence', 1);
});
