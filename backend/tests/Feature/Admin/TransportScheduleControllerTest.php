<?php

use App\Models\Branch;
use App\Models\BusinessRole;
use App\Models\Organization;
use App\Models\OrganizationBusinessRole;
use App\Models\Role;
use App\Models\ServiceItemStatus;
use App\Models\TransportPersonnel;
use App\Models\TransportRoute;
use App\Models\TransportRouteStop;
use App\Models\TransportSchedule;
use App\Models\TransportScheduleItem;
use App\Models\TransportStatus;
use App\Models\User;
use App\Models\UserRole;
use App\Models\Vehicle;
use App\Models\Waste;
use App\Models\WasteServiceRequest;
use App\Models\WasteServiceRequestItem;
use App\Models\WasteTreatmentApproval;
use App\Models\WorkflowLog;
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
use Database\Seeders\UnloadRequestStatusSeeder;

// Módulo Programación Logística, Fase 2a (D-PRG-01 a D-PRG-14) --
// TransportScheduleController + TransportScheduleWorkflowService. Mismo
// patrón de fixtures que ServiceRequestControllerTest (prefijo `ts` en vez
// de `sr` para no colisionar -- funciones globales de nivel de archivo Pest).
//
// Hallazgo Medio (revisión de seguridad Programación/Dispatch, 2026-07-19):
// el `beforeEach()` ahora corre `PermissionSeeder`/`RolePermissionSeeder`
// REALES -- antes `tsActor()` fabricaba `role_permissions` ad-hoc vía
// `firstOrCreate()`, lo que ocultaba el hallazgo Alto de que
// `RolePermissionSeeder` NUNCA había asignado `transport_schedules.*` al rol
// `LOGÍSTICA` en producción (la suite pasaba en verde con permisos que no
// existían fuera del test). Ahora `tsActor()` asigna el rol REAL sin
// fabricar sus permisos -- si alguien vuelve a romper esa asignación en
// `RolePermissionSeeder`, esta suite entera se cae en rojo.
beforeEach(function () {
    $this->seed(OrganizationStatusSeeder::class);
    $this->seed(PlatformOrganizationSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->seed(PermissionSeeder::class);
    $this->seed(RolePermissionSeeder::class);
    $this->seed(BusinessRoleSeeder::class);
    $this->seed(RespelStatusSeeder::class);
    $this->seed(ServiceStatusSeeder::class);
    $this->seed(ServiceItemStatusSeeder::class);
    $this->seed(TransportStatusSeeder::class);
    $this->seed(TransportScheduleWorkflowSeeder::class);
    // Fase 4 "Cita de Recepción en Planta" (D-PRG-13): confirm() ahora
    // dispara la creación automática de una unload_requests -- necesita el
    // catálogo de estados sembrado, aunque esta suite no pruebe la Fase 4
    // directamente (ver UnloadRequestControllerTest para esos casos).
    $this->seed(UnloadRequestStatusSeeder::class);
});

/**
 * A diferencia de `srActor()` (Solicitudes de Servicio, autorizado por
 * `business_role_id` de la ORGANIZACIÓN actora), `TransportScheduleWorkflowSeeder`
 * autoriza sus transiciones humanas por `role_id` del catálogo de SISTEMA
 * ('LOGÍSTICA', ya sembrado por `RoleSeeder`) -- el actor mismo debe tener
 * ese rol asignado (`user_roles`), no basta con que su organización tenga
 * cierto `business_role`.
 *
 * A diferencia de la versión anterior de este helper, YA NO fabrica
 * `permissions`/`role_permissions` ad-hoc -- asigna el rol `LOGÍSTICA` REAL
 * (sembrado por `RoleSeeder`, con sus permisos reales ya adjuntos por
 * `RolePermissionSeeder` en el `beforeEach`). `$codes` se conserva como
 * parámetro (documenta qué permiso espera cada test) pero ya NO controla qué
 * permisos recibe el actor -- eso lo decide, correctamente, el seeder de
 * producción; un array vacío sigue significando "sin rol asignado" (actor
 * sin ningún permiso).
 */
function tsActor(array $codes = [], ?int $tenantOrganizationId = null): User
{
    $actor = User::factory()->create(['tenant_organization_id' => $tenantOrganizationId]);

    if ($codes !== []) {
        $role = Role::query()->where('code', 'LOGÍSTICA')->firstOrFail();

        UserRole::query()->create(['user_id' => $actor->id, 'role_id' => $role->id, 'is_active' => true]);
    }

    return $actor;
}

function tsPlatformStaffActor(array $codes = []): User
{
    $platform = Organization::query()->where('is_platform_tenant', true)->first()
        ?? Organization::factory()->create(['is_platform_tenant' => true]);

    return tsActor($codes, $platform->id);
}

function tsGeneratorOrganization(): Organization
{
    $organization = Organization::factory()->create();
    $generator = BusinessRole::query()->where('code', 'GENERATOR')->firstOrFail();

    OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id,
        'business_role_id' => $generator->id,
        'assigned_at' => now(),
        'is_active' => true,
    ]);

    return $organization->fresh();
}

/**
 * `GESTOR` ya tiene `can_transport_waste=true` sembrado (BusinessRoleSeeder)
 * -- reutilizable directamente como "organización que programa" (Modalidad 1).
 */
function tsGestorOrganization(): Organization
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

/**
 * Construye un `waste_service_request_item` YA ACEPTADO (`item_status=ACCEPTED`)
 * cuya `waste_treatment_approval` pertenece a `$gestor` -- building block
 * reutilizado por casi todos los tests. `$branch` es la sede del Generador,
 * usada como `waste_service_requests.branch_id` (== `source_branch_id`
 * exigido por `TransportScheduleController::store()`).
 *
 * @return array{0: WasteServiceRequest, 1: WasteServiceRequestItem}
 */
function tsAcceptedItemFixture(Organization $generator, Organization $gestor, Branch $branch): array
{
    $waste = Waste::factory()->create(['organization_id' => $generator->id]);
    $approval = WasteTreatmentApproval::factory()->viable()->create([
        'organization_id' => $gestor->id,
        'waste_id' => $waste->id,
    ]);

    $serviceRequest = WasteServiceRequest::factory()->create([
        'organization_id' => $generator->id,
        'branch_id' => $branch->id,
    ]);

    $acceptedStatusId = ServiceItemStatus::query()->where('code', 'ACCEPTED')->value('id');

    $item = WasteServiceRequestItem::factory()->create([
        'service_request_id' => $serviceRequest->id,
        'waste_id' => $waste->id,
        'waste_treatment_approval_id' => $approval->id,
        'item_status_id' => $acceptedStatusId,
    ]);

    return [$serviceRequest, $item];
}

/**
 * `destination_branch_id` por defecto pertenece a la MISMA organización que
 * `$vehicle` (== la organización actora que programa, en todos los tests de
 * este archivo) -- hallazgo Medio (revisión de seguridad Programación/
 * Dispatch, 2026-07-19): `TransportScheduleController` ahora valida que
 * `destination_branch_id` pertenezca a la organización actora, mismo
 * criterio que ya aplicaba a `source_branch_id`/`vehicle_id`/
 * `transport_personnel_id`.
 */
function tsStorePayload(WasteServiceRequest $serviceRequest, WasteServiceRequestItem $item, Vehicle $vehicle, TransportPersonnel $personnel, Branch $sourceBranch, ?Branch $destinationBranch = null): array
{
    return [
        'waste_service_request_id' => $serviceRequest->id,
        'vehicle_id' => $vehicle->id,
        'transport_personnel_id' => $personnel->id,
        'source_branch_id' => $sourceBranch->id,
        'destination_branch_id' => ($destinationBranch ?? Branch::factory()->create(['organization_id' => $vehicle->organization_id]))->id,
        'scheduled_pickup_at' => now()->addDay()->toIso8601String(),
        'items' => [
            ['waste_service_request_item_id' => $item->id, 'scheduled_quantity' => 50],
        ],
    ];
}

// ---- store(): creación válida + anti-IDOR + doble-programación ----

test('store crea la cabecera en BOR + items', function () {
    $generator = tsGeneratorOrganization();
    $gestor = tsGestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$serviceRequest, $item] = tsAcceptedItemFixture($generator, $gestor, $branch);

    $vehicle = Vehicle::factory()->create(['organization_id' => $gestor->id]);
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $gestor->id]);

    $actor = tsActor(['transport_schedules.create'], $gestor->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/transport-schedules', tsStorePayload($serviceRequest, $item, $vehicle, $personnel, $branch))
        ->assertCreated();

    $response->assertJsonPath('transport_schedule.organization_id', $gestor->id)
        ->assertJsonPath('transport_schedule.transport_status.code', 'BOR')
        ->assertJsonPath('transport_schedule.items.0.waste_service_request_item_id', $item->id);

    expect(TransportScheduleItem::query()->where('waste_service_request_item_id', $item->id)->exists())->toBeTrue();
});

test('store rechaza un ítem cuya aprobación pertenece a OTRO Gestor (anti-IDOR, autorización cruzada)', function () {
    $generator = tsGeneratorOrganization();
    $gestorOwner = tsGestorOrganization();
    $gestorImpostor = tsGestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$serviceRequest, $item] = tsAcceptedItemFixture($generator, $gestorOwner, $branch);

    $vehicle = Vehicle::factory()->create(['organization_id' => $gestorImpostor->id]);
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $gestorImpostor->id]);

    $actor = tsActor(['transport_schedules.create'], $gestorImpostor->id);

    $this->actingAs($actor)->postJson('/api/admin/transport-schedules', tsStorePayload($serviceRequest, $item, $vehicle, $personnel, $branch))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('items.0.waste_service_request_item_id');

    expect(TransportSchedule::query()->count())->toBe(0);
});

test('store rechaza un ítem que NO está en estado ACCEPTED', function () {
    $generator = tsGeneratorOrganization();
    $gestor = tsGestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);

    $waste = Waste::factory()->create(['organization_id' => $generator->id]);
    $approval = WasteTreatmentApproval::factory()->viable()->create(['organization_id' => $gestor->id, 'waste_id' => $waste->id]);
    $serviceRequest = WasteServiceRequest::factory()->create(['organization_id' => $generator->id, 'branch_id' => $branch->id]);
    $pendingStatusId = ServiceItemStatus::query()->where('code', 'PENDING')->value('id');
    $item = WasteServiceRequestItem::factory()->create([
        'service_request_id' => $serviceRequest->id,
        'waste_id' => $waste->id,
        'waste_treatment_approval_id' => $approval->id,
        'item_status_id' => $pendingStatusId,
    ]);

    $vehicle = Vehicle::factory()->create(['organization_id' => $gestor->id]);
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $gestor->id]);
    $actor = tsActor(['transport_schedules.create'], $gestor->id);

    $this->actingAs($actor)->postJson('/api/admin/transport-schedules', tsStorePayload($serviceRequest, $item, $vehicle, $personnel, $branch))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('items.0.waste_service_request_item_id');
});

test('store rechaza un vehicle_id que pertenece a OTRA organización', function () {
    $generator = tsGeneratorOrganization();
    $gestor = tsGestorOrganization();
    $otherOrganization = Organization::factory()->create();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$serviceRequest, $item] = tsAcceptedItemFixture($generator, $gestor, $branch);

    $vehicle = Vehicle::factory()->create(['organization_id' => $otherOrganization->id]);
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $gestor->id]);
    $actor = tsActor(['transport_schedules.create'], $gestor->id);

    $this->actingAs($actor)->postJson('/api/admin/transport-schedules', tsStorePayload($serviceRequest, $item, $vehicle, $personnel, $branch))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('vehicle_id');
});

test('store rechaza un transport_personnel_id que pertenece a OTRA organización', function () {
    $generator = tsGeneratorOrganization();
    $gestor = tsGestorOrganization();
    $otherOrganization = Organization::factory()->create();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$serviceRequest, $item] = tsAcceptedItemFixture($generator, $gestor, $branch);

    $vehicle = Vehicle::factory()->create(['organization_id' => $gestor->id]);
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $otherOrganization->id]);
    $actor = tsActor(['transport_schedules.create'], $gestor->id);

    $this->actingAs($actor)->postJson('/api/admin/transport-schedules', tsStorePayload($serviceRequest, $item, $vehicle, $personnel, $branch))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('transport_personnel_id');
});

test('store rechaza un ítem ya asignado a OTRA programación de transporte ACTIVA (doble-programación)', function () {
    $generator = tsGeneratorOrganization();
    $gestor = tsGestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$serviceRequest, $item] = tsAcceptedItemFixture($generator, $gestor, $branch);

    $vehicle = Vehicle::factory()->create(['organization_id' => $gestor->id]);
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $gestor->id]);
    $actor = tsActor(['transport_schedules.create'], $gestor->id);

    $this->actingAs($actor)->postJson('/api/admin/transport-schedules', tsStorePayload($serviceRequest, $item, $vehicle, $personnel, $branch))
        ->assertCreated();

    // Segunda organización, SU PROPIO vehículo/conductor, intentando cubrir
    // el MISMO ítem (ya cubierto por la programación anterior, todavía en
    // BOR -- estado no-final).
    $vehicle2 = Vehicle::factory()->create(['organization_id' => $gestor->id]);
    $personnel2 = TransportPersonnel::factory()->create(['organization_id' => $gestor->id]);

    $this->actingAs($actor)->postJson('/api/admin/transport-schedules', tsStorePayload($serviceRequest, $item, $vehicle2, $personnel2, $branch))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('items.0.waste_service_request_item_id');

    expect(TransportSchedule::query()->count())->toBe(1);
});

test('store permite re-programar un ítem cuya programación previa fue CANCELADA', function () {
    $generator = tsGeneratorOrganization();
    $gestor = tsGestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$serviceRequest, $item] = tsAcceptedItemFixture($generator, $gestor, $branch);

    $vehicle = Vehicle::factory()->create(['organization_id' => $gestor->id]);
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $gestor->id]);
    $actor = tsActor(['transport_schedules.create', 'transport_schedules.cancel'], $gestor->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/transport-schedules', tsStorePayload($serviceRequest, $item, $vehicle, $personnel, $branch))
        ->assertCreated();

    $firstSchedule = TransportSchedule::query()->findOrFail($response->json('transport_schedule.id'));
    $this->actingAs($actor)->postJson("/api/admin/transport-schedules/{$firstSchedule->id}/cancel")->assertOk();

    $vehicle2 = Vehicle::factory()->create(['organization_id' => $gestor->id]);
    $personnel2 = TransportPersonnel::factory()->create(['organization_id' => $gestor->id]);

    $this->actingAs($actor)->postJson('/api/admin/transport-schedules', tsStorePayload($serviceRequest, $item, $vehicle2, $personnel2, $branch))
        ->assertCreated();

    expect(TransportSchedule::query()->count())->toBe(2);
});

test('store rechaza cuando la organización actora NO tiene la capacidad can_transport_waste', function () {
    $generator = tsGeneratorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $serviceRequest = WasteServiceRequest::factory()->create(['organization_id' => $generator->id, 'branch_id' => $branch->id]);
    $waste = Waste::factory()->create(['organization_id' => $generator->id]);
    $item = WasteServiceRequestItem::factory()->create(['service_request_id' => $serviceRequest->id, 'waste_id' => $waste->id]);

    $vehicle = Vehicle::factory()->create(['organization_id' => $generator->id]);
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $generator->id]);

    // El Generador NO tiene business_role con can_transport_waste=true.
    $actor = tsActor(['transport_schedules.create'], $generator->id);

    $this->actingAs($actor)->postJson('/api/admin/transport-schedules', tsStorePayload($serviceRequest, $item, $vehicle, $personnel, $branch))
        ->assertForbidden();

    expect(TransportSchedule::query()->count())->toBe(0);
});

test('store rechaza source_branch_id distinto de la sede de la solicitud de servicio de origen', function () {
    $generator = tsGeneratorOrganization();
    $gestor = tsGestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $otherBranch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$serviceRequest, $item] = tsAcceptedItemFixture($generator, $gestor, $branch);

    $vehicle = Vehicle::factory()->create(['organization_id' => $gestor->id]);
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $gestor->id]);
    $actor = tsActor(['transport_schedules.create'], $gestor->id);

    $payload = tsStorePayload($serviceRequest, $item, $vehicle, $personnel, $otherBranch);

    $this->actingAs($actor)->postJson('/api/admin/transport-schedules', $payload)
        ->assertUnprocessable()
        ->assertJsonValidationErrors('source_branch_id');
});

// ---- submit()/confirm()/cancel(): transiciones + WorkflowLog ----

test('submit() transiciona BOR->PEND y escribe un WorkflowLog', function () {
    $generator = tsGeneratorOrganization();
    $gestor = tsGestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$serviceRequest, $item] = tsAcceptedItemFixture($generator, $gestor, $branch);
    $vehicle = Vehicle::factory()->create(['organization_id' => $gestor->id]);
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $gestor->id]);
    $actor = tsActor(['transport_schedules.create', 'transport_schedules.update'], $gestor->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/transport-schedules', tsStorePayload($serviceRequest, $item, $vehicle, $personnel, $branch))
        ->assertCreated();

    $schedule = TransportSchedule::query()->findOrFail($response->json('transport_schedule.id'));

    $this->actingAs($actor)->postJson("/api/admin/transport-schedules/{$schedule->id}/submit")
        ->assertOk()
        ->assertJsonPath('transport_schedule.transport_status.code', 'PEND');

    $log = WorkflowLog::query()
        ->where('process_type', 'TRANSPORT_SCHEDULE')
        ->where('process_id', $schedule->id)
        ->where('new_status', 'PEND')
        ->first();

    expect($log)->not->toBeNull()
        ->and($log->previous_status)->toBe('BOR')
        ->and($log->user_id)->toBe($actor->id)
        ->and($log->tenant_organization_id)->toBe($gestor->id);
});

test('confirm() desde PEND encadena PEND->PROG->CONF (2 transiciones en una sola llamada)', function () {
    $generator = tsGeneratorOrganization();
    $gestor = tsGestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$serviceRequest, $item] = tsAcceptedItemFixture($generator, $gestor, $branch);
    $vehicle = Vehicle::factory()->create(['organization_id' => $gestor->id]);
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $gestor->id]);
    $actor = tsActor(['transport_schedules.create', 'transport_schedules.update'], $gestor->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/transport-schedules', tsStorePayload($serviceRequest, $item, $vehicle, $personnel, $branch))
        ->assertCreated();

    $schedule = TransportSchedule::query()->findOrFail($response->json('transport_schedule.id'));
    $this->actingAs($actor)->postJson("/api/admin/transport-schedules/{$schedule->id}/submit")->assertOk();

    $this->actingAs($actor)->postJson("/api/admin/transport-schedules/{$schedule->id}/confirm")
        ->assertOk()
        ->assertJsonPath('transport_schedule.transport_status.code', 'CONF');

    $logs = WorkflowLog::query()
        ->where('process_type', 'TRANSPORT_SCHEDULE')
        ->where('process_id', $schedule->id)
        ->orderBy('id')
        ->get();

    expect($logs)->toHaveCount(3); // BOR->PEND (submit) + PEND->PROG + PROG->CONF (confirm)
    expect($logs[1]->previous_status)->toBe('PEND')->and($logs[1]->new_status)->toBe('PROG');
    expect($logs[2]->previous_status)->toBe('PROG')->and($logs[2]->new_status)->toBe('CONF');
});

test('confirm() desde PROG solo aplica PROG->CONF (1 WorkflowLog nuevo)', function () {
    $generator = tsGeneratorOrganization();
    $gestor = tsGestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$serviceRequest, $item] = tsAcceptedItemFixture($generator, $gestor, $branch);
    $vehicle = Vehicle::factory()->create(['organization_id' => $gestor->id]);
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $gestor->id]);
    $actor = tsActor(['transport_schedules.create', 'transport_schedules.update'], $gestor->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/transport-schedules', tsStorePayload($serviceRequest, $item, $vehicle, $personnel, $branch))
        ->assertCreated();

    $schedule = TransportSchedule::query()->findOrFail($response->json('transport_schedule.id'));
    $progStatusId = TransportStatus::query()->where('code', 'PROG')->value('id');
    $schedule->forceFill(['transport_status_id' => $progStatusId])->save();

    $this->actingAs($actor)->postJson("/api/admin/transport-schedules/{$schedule->id}/confirm")
        ->assertOk()
        ->assertJsonPath('transport_schedule.transport_status.code', 'CONF');

    $logs = WorkflowLog::query()
        ->where('process_type', 'TRANSPORT_SCHEDULE')
        ->where('process_id', $schedule->id)
        ->get();

    expect($logs)->toHaveCount(1);
    expect($logs[0]->previous_status)->toBe('PROG')->and($logs[0]->new_status)->toBe('CONF');
});

test('cancel() alcanzable desde BOR/PEND/PROG/CONF y escribe WorkflowLog', function () {
    $generator = tsGeneratorOrganization();
    $gestor = tsGestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$serviceRequest, $item] = tsAcceptedItemFixture($generator, $gestor, $branch);
    $vehicle = Vehicle::factory()->create(['organization_id' => $gestor->id]);
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $gestor->id]);
    $actor = tsActor(['transport_schedules.create', 'transport_schedules.cancel'], $gestor->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/transport-schedules', tsStorePayload($serviceRequest, $item, $vehicle, $personnel, $branch))
        ->assertCreated();

    $schedule = TransportSchedule::query()->findOrFail($response->json('transport_schedule.id'));

    $this->actingAs($actor)->postJson("/api/admin/transport-schedules/{$schedule->id}/cancel")
        ->assertOk()
        ->assertJsonPath('transport_schedule.transport_status.code', 'CANC');

    $log = WorkflowLog::query()
        ->where('process_type', 'TRANSPORT_SCHEDULE')
        ->where('process_id', $schedule->id)
        ->where('new_status', 'CANC')
        ->first();

    expect($log)->not->toBeNull()->and($log->previous_status)->toBe('BOR');
});

test('cancel() NO está sembrado desde EJEC (transición inexistente -> 422)', function () {
    $generator = tsGeneratorOrganization();
    $gestor = tsGestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$serviceRequest, $item] = tsAcceptedItemFixture($generator, $gestor, $branch);
    $vehicle = Vehicle::factory()->create(['organization_id' => $gestor->id]);
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $gestor->id]);
    $actor = tsActor(['transport_schedules.create', 'transport_schedules.cancel'], $gestor->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/transport-schedules', tsStorePayload($serviceRequest, $item, $vehicle, $personnel, $branch))
        ->assertCreated();

    $schedule = TransportSchedule::query()->findOrFail($response->json('transport_schedule.id'));
    $ejecStatusId = TransportStatus::query()->where('code', 'EJEC')->value('id');
    $schedule->forceFill(['transport_status_id' => $ejecStatusId])->save();

    $this->actingAs($actor)->postJson("/api/admin/transport-schedules/{$schedule->id}/cancel")
        ->assertUnprocessable()
        ->assertJsonValidationErrors('transport_status');
});

// ---- update(): solo mientras BOR/PEND ----

test('update() permite editar mientras esté en BOR, rechaza una vez en CONF', function () {
    $generator = tsGeneratorOrganization();
    $gestor = tsGestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$serviceRequest, $item] = tsAcceptedItemFixture($generator, $gestor, $branch);
    $vehicle = Vehicle::factory()->create(['organization_id' => $gestor->id]);
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $gestor->id]);
    $actor = tsActor(['transport_schedules.create', 'transport_schedules.update'], $gestor->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/transport-schedules', tsStorePayload($serviceRequest, $item, $vehicle, $personnel, $branch))
        ->assertCreated();

    $schedule = TransportSchedule::query()->findOrFail($response->json('transport_schedule.id'));

    $this->actingAs($actor)->putJson("/api/admin/transport-schedules/{$schedule->id}", ['priority' => 'URGENT'])
        ->assertOk()
        ->assertJsonPath('transport_schedule.priority', 'URGENT');

    $this->actingAs($actor)->postJson("/api/admin/transport-schedules/{$schedule->id}/submit")->assertOk();
    $this->actingAs($actor)->postJson("/api/admin/transport-schedules/{$schedule->id}/confirm")->assertOk();

    $this->actingAs($actor)->putJson("/api/admin/transport-schedules/{$schedule->id}", ['priority' => 'LOW'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('transport_status');
});

// ---- index()/show(): aislamiento tenant-vs-platform-staff ----

test('index(): una organización ve SOLO sus propias programaciones; platform staff ve todas y puede filtrar', function () {
    $generatorA = tsGeneratorOrganization();
    $gestorA = tsGestorOrganization();
    $branchA = Branch::factory()->create(['organization_id' => $generatorA->id]);
    [$serviceRequestA, $itemA] = tsAcceptedItemFixture($generatorA, $gestorA, $branchA);
    $vehicleA = Vehicle::factory()->create(['organization_id' => $gestorA->id]);
    $personnelA = TransportPersonnel::factory()->create(['organization_id' => $gestorA->id]);
    $actorA = tsActor(['transport_schedules.create', 'transport_schedules.read'], $gestorA->id);

    $responseA = $this->actingAs($actorA)->postJson('/api/admin/transport-schedules', tsStorePayload($serviceRequestA, $itemA, $vehicleA, $personnelA, $branchA))
        ->assertCreated();

    $generatorB = tsGeneratorOrganization();
    $gestorB = tsGestorOrganization();
    $branchB = Branch::factory()->create(['organization_id' => $generatorB->id]);
    [$serviceRequestB, $itemB] = tsAcceptedItemFixture($generatorB, $gestorB, $branchB);
    $vehicleB = Vehicle::factory()->create(['organization_id' => $gestorB->id]);
    $personnelB = TransportPersonnel::factory()->create(['organization_id' => $gestorB->id]);
    $actorB = tsActor(['transport_schedules.create'], $gestorB->id);

    $this->actingAs($actorB)->postJson('/api/admin/transport-schedules', tsStorePayload($serviceRequestB, $itemB, $vehicleB, $personnelB, $branchB))
        ->assertCreated();

    $viewA = $this->actingAs($actorA)->getJson('/api/admin/transport-schedules')->assertOk();
    expect($viewA->json('total'))->toBe(1)
        ->and(collect($viewA->json('data'))->pluck('id'))->toContain($responseA->json('transport_schedule.id'));

    $platformActor = tsPlatformStaffActor(['transport_schedules.read']);
    $allView = $this->actingAs($platformActor)->getJson('/api/admin/transport-schedules')->assertOk();
    expect($allView->json('total'))->toBe(2);

    $filteredView = $this->actingAs($platformActor)
        ->getJson("/api/admin/transport-schedules?organization_id={$gestorA->id}")
        ->assertOk();
    expect($filteredView->json('total'))->toBe(1);
});

test('show(): una organización ajena recibe 403 (IDOR)', function () {
    $generator = tsGeneratorOrganization();
    $gestor = tsGestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$serviceRequest, $item] = tsAcceptedItemFixture($generator, $gestor, $branch);
    $vehicle = Vehicle::factory()->create(['organization_id' => $gestor->id]);
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $gestor->id]);
    $actor = tsActor(['transport_schedules.create'], $gestor->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/transport-schedules', tsStorePayload($serviceRequest, $item, $vehicle, $personnel, $branch))
        ->assertCreated();

    $foreignOrganization = tsGestorOrganization();
    $foreignActor = tsActor(['transport_schedules.read'], $foreignOrganization->id);

    $this->actingAs($foreignActor)
        ->getJson("/api/admin/transport-schedules/{$response->json('transport_schedule.id')}")
        ->assertForbidden();
});

// ---- assignToRoute(): agrupación simple en ruta ----

test('assignToRoute() agrupa la programación en una ruta de la MISMA organización, con stop_sequence autoincremental', function () {
    $generator = tsGeneratorOrganization();
    $gestor = tsGestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$serviceRequestA, $itemA] = tsAcceptedItemFixture($generator, $gestor, $branch);
    [$serviceRequestB, $itemB] = tsAcceptedItemFixture($generator, $gestor, $branch);

    $vehicleA = Vehicle::factory()->create(['organization_id' => $gestor->id]);
    $personnelA = TransportPersonnel::factory()->create(['organization_id' => $gestor->id]);
    $vehicleB = Vehicle::factory()->create(['organization_id' => $gestor->id]);
    $personnelB = TransportPersonnel::factory()->create(['organization_id' => $gestor->id]);

    $actor = tsActor(['transport_schedules.create', 'transport_schedules.update'], $gestor->id);

    $responseA = $this->actingAs($actor)->postJson('/api/admin/transport-schedules', tsStorePayload($serviceRequestA, $itemA, $vehicleA, $personnelA, $branch))->assertCreated();
    $responseB = $this->actingAs($actor)->postJson('/api/admin/transport-schedules', tsStorePayload($serviceRequestB, $itemB, $vehicleB, $personnelB, $branch))->assertCreated();

    $route = TransportRoute::factory()->create(['organization_id' => $gestor->id]);

    $this->actingAs($actor)->postJson("/api/admin/transport-schedules/{$responseA->json('transport_schedule.id')}/route", ['transport_route_id' => $route->id])
        ->assertOk()
        ->assertJsonPath('route_stop.stop_sequence', 1);

    $this->actingAs($actor)->postJson("/api/admin/transport-schedules/{$responseB->json('transport_schedule.id')}/route", ['transport_route_id' => $route->id])
        ->assertOk()
        ->assertJsonPath('route_stop.stop_sequence', 2);

    expect(TransportRouteStop::query()->where('transport_route_id', $route->id)->count())->toBe(2);
});

test('assignToRoute() rechaza una ruta que pertenece a OTRA organización', function () {
    $generator = tsGeneratorOrganization();
    $gestor = tsGestorOrganization();
    $otherGestor = tsGestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$serviceRequest, $item] = tsAcceptedItemFixture($generator, $gestor, $branch);
    $vehicle = Vehicle::factory()->create(['organization_id' => $gestor->id]);
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $gestor->id]);
    $actor = tsActor(['transport_schedules.create', 'transport_schedules.update'], $gestor->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/transport-schedules', tsStorePayload($serviceRequest, $item, $vehicle, $personnel, $branch))
        ->assertCreated();

    $foreignRoute = TransportRoute::factory()->create(['organization_id' => $otherGestor->id]);

    $this->actingAs($actor)->postJson("/api/admin/transport-schedules/{$response->json('transport_schedule.id')}/route", ['transport_route_id' => $foreignRoute->id])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('transport_route_id');
});

// ---- destination_branch_id / responsible_user_id: validación de pertenencia (hallazgo Medio) ----

test('store rechaza un destination_branch_id que pertenece a OTRA organización', function () {
    $generator = tsGeneratorOrganization();
    $gestor = tsGestorOrganization();
    $otherOrganization = Organization::factory()->create();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$serviceRequest, $item] = tsAcceptedItemFixture($generator, $gestor, $branch);

    $vehicle = Vehicle::factory()->create(['organization_id' => $gestor->id]);
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $gestor->id]);
    $foreignBranch = Branch::factory()->create(['organization_id' => $otherOrganization->id]);
    $actor = tsActor(['transport_schedules.create'], $gestor->id);

    $payload = tsStorePayload($serviceRequest, $item, $vehicle, $personnel, $branch, $foreignBranch);

    $this->actingAs($actor)->postJson('/api/admin/transport-schedules', $payload)
        ->assertUnprocessable()
        ->assertJsonValidationErrors('destination_branch_id');

    expect(TransportSchedule::query()->count())->toBe(0);
});

test('store rechaza un responsible_user_id que pertenece a OTRA organización', function () {
    $generator = tsGeneratorOrganization();
    $gestor = tsGestorOrganization();
    $otherOrganization = Organization::factory()->create();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$serviceRequest, $item] = tsAcceptedItemFixture($generator, $gestor, $branch);

    $vehicle = Vehicle::factory()->create(['organization_id' => $gestor->id]);
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $gestor->id]);
    $actor = tsActor(['transport_schedules.create'], $gestor->id);
    $foreignResponsible = User::factory()->create(['tenant_organization_id' => $otherOrganization->id]);

    $payload = tsStorePayload($serviceRequest, $item, $vehicle, $personnel, $branch);
    $payload['responsible_user_id'] = $foreignResponsible->id;

    $this->actingAs($actor)->postJson('/api/admin/transport-schedules', $payload)
        ->assertUnprocessable()
        ->assertJsonValidationErrors('responsible_user_id');

    expect(TransportSchedule::query()->count())->toBe(0);
});

test('update() rechaza un destination_branch_id que pertenece a OTRA organización', function () {
    $generator = tsGeneratorOrganization();
    $gestor = tsGestorOrganization();
    $otherOrganization = Organization::factory()->create();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$serviceRequest, $item] = tsAcceptedItemFixture($generator, $gestor, $branch);
    $vehicle = Vehicle::factory()->create(['organization_id' => $gestor->id]);
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $gestor->id]);
    $actor = tsActor(['transport_schedules.create', 'transport_schedules.update'], $gestor->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/transport-schedules', tsStorePayload($serviceRequest, $item, $vehicle, $personnel, $branch))
        ->assertCreated();

    $schedule = TransportSchedule::query()->findOrFail($response->json('transport_schedule.id'));
    $foreignBranch = Branch::factory()->create(['organization_id' => $otherOrganization->id]);

    $this->actingAs($actor)->putJson("/api/admin/transport-schedules/{$schedule->id}", ['destination_branch_id' => $foreignBranch->id])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('destination_branch_id');
});

test('update() rechaza un responsible_user_id que pertenece a OTRA organización', function () {
    $generator = tsGeneratorOrganization();
    $gestor = tsGestorOrganization();
    $otherOrganization = Organization::factory()->create();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$serviceRequest, $item] = tsAcceptedItemFixture($generator, $gestor, $branch);
    $vehicle = Vehicle::factory()->create(['organization_id' => $gestor->id]);
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $gestor->id]);
    $actor = tsActor(['transport_schedules.create', 'transport_schedules.update'], $gestor->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/transport-schedules', tsStorePayload($serviceRequest, $item, $vehicle, $personnel, $branch))
        ->assertCreated();

    $schedule = TransportSchedule::query()->findOrFail($response->json('transport_schedule.id'));
    $foreignResponsible = User::factory()->create(['tenant_organization_id' => $otherOrganization->id]);

    $this->actingAs($actor)->putJson("/api/admin/transport-schedules/{$schedule->id}", ['responsible_user_id' => $foreignResponsible->id])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('responsible_user_id');
});

// ---- índice único parcial transport_schedule_items_active_unique (hallazgo Medio, condición de carrera) ----

/**
 * `resolveAndValidateItems()`/`itemAlreadyScheduled()` solo consulta
 * programaciones YA EXISTENTES en base de datos -- no detecta que el MISMO
 * `waste_service_request_item_id` aparezca dos veces dentro del propio
 * array `items` de un ÚNICO payload. Antes de la migración
 * `add_active_unique_index_to_transport_schedule_items_table`, esto insertaba
 * silenciosamente 2 filas duplicadas en `transport_schedule_items` -- el
 * mismo hueco que permitiría a 2 requests concurrentes duplicar la
 * asignación. Este test fuerza ese escenario de forma determinística
 * (secuencial, sin necesidad de hilos reales) y confirma que la violación
 * del índice se traduce a un 422 legible, no a un 500.
 */
test('store rechaza (422) un mismo waste_service_request_item_id duplicado dentro del mismo payload (índice único parcial)', function () {
    $generator = tsGeneratorOrganization();
    $gestor = tsGestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$serviceRequest, $item] = tsAcceptedItemFixture($generator, $gestor, $branch);

    $vehicle = Vehicle::factory()->create(['organization_id' => $gestor->id]);
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $gestor->id]);
    $actor = tsActor(['transport_schedules.create'], $gestor->id);

    $payload = tsStorePayload($serviceRequest, $item, $vehicle, $personnel, $branch);
    $payload['items'] = [
        ['waste_service_request_item_id' => $item->id, 'scheduled_quantity' => 30],
        ['waste_service_request_item_id' => $item->id, 'scheduled_quantity' => 20],
    ];

    $this->actingAs($actor)->postJson('/api/admin/transport-schedules', $payload)
        ->assertUnprocessable()
        ->assertJsonValidationErrors('items');

    // La transacción completa se revierte -- ni la cabecera ni ningún ítem quedan huérfanos.
    expect(TransportSchedule::query()->count())->toBe(0);
    expect(TransportScheduleItem::query()->count())->toBe(0);
});

test('el índice único parcial permite reprogramar un ítem una vez que la programación previa llega a un estado FINAL', function () {
    $generator = tsGeneratorOrganization();
    $gestor = tsGestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$serviceRequest, $item] = tsAcceptedItemFixture($generator, $gestor, $branch);
    $vehicle = Vehicle::factory()->create(['organization_id' => $gestor->id]);
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $gestor->id]);
    $actor = tsActor(['transport_schedules.create', 'transport_schedules.cancel'], $gestor->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/transport-schedules', tsStorePayload($serviceRequest, $item, $vehicle, $personnel, $branch))
        ->assertCreated();

    $firstSchedule = TransportSchedule::query()->findOrFail($response->json('transport_schedule.id'));
    $firstItem = TransportScheduleItem::query()->where('transport_schedule_id', $firstSchedule->id)->firstOrFail();
    expect($firstItem->is_active)->toBeTrue();

    $this->actingAs($actor)->postJson("/api/admin/transport-schedules/{$firstSchedule->id}/cancel")->assertOk();

    // La cancelación (estado FINAL `CANC`) apaga `is_active` en cascada --
    // ver TransportScheduleWorkflowService::transition() -- liberando el
    // slot del índice único parcial para el mismo ítem.
    expect($firstItem->fresh()->is_active)->toBeFalse();
    expect(TransportScheduleItem::query()->where('waste_service_request_item_id', $item->id)->where('is_active', true)->count())->toBe(0);
});

// ---- LOGÍSTICA real (RolePermissionSeeder de producción, SIN ADMINISTRADOR) ----

/**
 * Hallazgo Alto (revisión de seguridad Programación/Dispatch, 2026-07-19,
 * decisión confirmada por el usuario): antes de este lote,
 * `RolePermissionSeeder` NUNCA asignaba `transport_schedules.*` al rol de
 * sistema `LOGÍSTICA` -- un usuario con SOLO ese rol (sin `ADMINISTRADOR`)
 * quedaba bloqueado en TODO el ciclo de `TransportScheduleController`, pese
 * a que `TransportScheduleWorkflowSeeder` YA lo autorizaba como actor de
 * workflow. Este test confirma el ciclo COMPLETO store()->submit()->
 * confirm()->cancel() con un actor sembrado EXCLUSIVAMENTE vía los seeders
 * reales de producción (`RoleSeeder`+`PermissionSeeder`+`RolePermissionSeeder`,
 * ya corridos en el `beforeEach`), sin ningún atajo de fixture.
 */
test('un actor con SOLO el rol LOGÍSTICA real (sembrado por RolePermissionSeeder de producción) completa store->submit->confirm->cancel', function () {
    $generator = tsGeneratorOrganization();
    $gestor = tsGestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$serviceRequest, $item] = tsAcceptedItemFixture($generator, $gestor, $branch);
    $vehicle = Vehicle::factory()->create(['organization_id' => $gestor->id]);
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $gestor->id]);

    // Actor SOLO con el rol LOGÍSTICA real -- SIN ADMINISTRADOR, sin
    // permisos fabricados a mano.
    $actor = tsActor(['transport_schedules.create'], $gestor->id);

    expect($actor->hasRole('LOGÍSTICA'))->toBeTrue()
        ->and($actor->hasRole('ADMINISTRADOR'))->toBeFalse();

    $response = $this->actingAs($actor)->postJson('/api/admin/transport-schedules', tsStorePayload($serviceRequest, $item, $vehicle, $personnel, $branch))
        ->assertCreated();

    $schedule = TransportSchedule::query()->findOrFail($response->json('transport_schedule.id'));

    $this->actingAs($actor)->postJson("/api/admin/transport-schedules/{$schedule->id}/submit")
        ->assertOk()
        ->assertJsonPath('transport_schedule.transport_status.code', 'PEND');

    $this->actingAs($actor)->postJson("/api/admin/transport-schedules/{$schedule->id}/confirm")
        ->assertOk()
        ->assertJsonPath('transport_schedule.transport_status.code', 'CONF');

    $this->actingAs($actor)->postJson("/api/admin/transport-schedules/{$schedule->id}/cancel")
        ->assertOk()
        ->assertJsonPath('transport_schedule.transport_status.code', 'CANC');
});
