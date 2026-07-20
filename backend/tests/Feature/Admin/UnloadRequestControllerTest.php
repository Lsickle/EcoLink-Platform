<?php

use App\Models\Branch;
use App\Models\BusinessRole;
use App\Models\Organization;
use App\Models\OrganizationBusinessRole;
use App\Models\Role;
use App\Models\ServiceItemStatus;
use App\Models\TransportPersonnel;
use App\Models\TransportSchedule;
use App\Models\UnloadRequest;
use App\Models\User;
use App\Models\UserRole;
use App\Models\Vehicle;
use App\Models\Waste;
use App\Models\WasteServiceRequest;
use App\Models\WasteServiceRequestItem;
use App\Models\WasteTreatmentApproval;
use App\Models\WorkflowLog;
use App\Services\UnloadRequestAutomationService;
use Database\Seeders\BusinessRoleSeeder;
use Database\Seeders\ManifestStatusSeeder;
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
use Database\Seeders\UnloadRequestWorkflowSeeder;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

// Fase 4 "Cita de Recepción en Planta" -- UnloadRequestController +
// UnloadRequestWorkflowService + UnloadRequestAutomationService (D-PRG-13).
// Mismo patrón de fixtures que TransportScheduleControllerTest/
// ManifestLoadControllerTest (prefijo `ur`).
//
// NOTA de diseño de fixtures: `TransportScheduleController::store()` exige
// que `destination_branch_id` pertenezca a la MISMA organización actora
// (Gestor que programa) -- por lo tanto, en el flujo AUTOMÁTICO (D-PRG-13,
// derivado de una transport_schedule), `carrier_organization_id` y la
// organización RECEPTORA de la unload_request generada SIEMPRE coinciden
// (mismo Gestor). El escenario BILATERAL "de verdad" (transportador y
// receptor son organizaciones DISTINTAS) solo es representable hoy vía la
// creación MANUAL "anticipada" (D-RCP, `UnloadRequestController::store()`,
// que NO impone esa restricción sobre `receiving_branch_id`) -- por eso los
// tests de aprobar/rechazar/anti-IDOR de decisión usan creación manual con 2
// organizaciones distintas, y el fixture de automatización se reserva para
// el test dedicado de D-PRG-13.

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
    $this->seed(ManifestStatusSeeder::class);
    $this->seed(UnloadRequestStatusSeeder::class);
    $this->seed(UnloadRequestWorkflowSeeder::class);
});

function urActor(array $codes = [], ?int $tenantOrganizationId = null): User
{
    $actor = User::factory()->create(['tenant_organization_id' => $tenantOrganizationId]);

    if ($codes !== []) {
        $role = Role::query()->where('code', 'LOGÍSTICA')->firstOrFail();

        UserRole::query()->create(['user_id' => $actor->id, 'role_id' => $role->id, 'is_active' => true]);
    }

    return $actor;
}

function urGeneratorOrganization(): Organization
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

function urGestorOrganization(): Organization
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
 * Construye y CONFIRMA (vía HTTP real: store->submit->confirm) una
 * `TransportSchedule` de `$gestor` recolectando en `$generatorBranch` -- para
 * disparar la automatización D-PRG-13. Devuelve la respuesta JSON de
 * `confirm()` (incluye `transport_schedule` + `unload_request`).
 */
function urConfirmedScheduleFixture(Organization $generator, Organization $gestor, Branch $generatorBranch): array
{
    $waste = Waste::factory()->create(['organization_id' => $generator->id]);
    $approval = WasteTreatmentApproval::factory()->viable()->create([
        'organization_id' => $gestor->id,
        'waste_id' => $waste->id,
    ]);

    $serviceRequest = WasteServiceRequest::factory()->create([
        'organization_id' => $generator->id,
        'branch_id' => $generatorBranch->id,
    ]);

    $acceptedStatusId = ServiceItemStatus::query()->where('code', 'ACCEPTED')->value('id');

    $requestItem = WasteServiceRequestItem::factory()->create([
        'service_request_id' => $serviceRequest->id,
        'waste_id' => $waste->id,
        'waste_treatment_approval_id' => $approval->id,
        'item_status_id' => $acceptedStatusId,
    ]);

    $vehicle = Vehicle::factory()->create(['organization_id' => $gestor->id]);
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $gestor->id]);
    $destinationBranch = Branch::factory()->create(['organization_id' => $gestor->id]);

    $actor = urActor(['transport_schedules.create', 'transport_schedules.update'], $gestor->id);

    $storeResponse = test()->actingAs($actor)->postJson('/api/admin/transport-schedules', [
        'waste_service_request_id' => $serviceRequest->id,
        'vehicle_id' => $vehicle->id,
        'transport_personnel_id' => $personnel->id,
        'source_branch_id' => $generatorBranch->id,
        'destination_branch_id' => $destinationBranch->id,
        'scheduled_pickup_at' => now()->addDay()->toIso8601String(),
        'items' => [
            ['waste_service_request_item_id' => $requestItem->id, 'scheduled_quantity' => 50],
        ],
    ])->assertCreated();

    $scheduleId = $storeResponse->json('transport_schedule.id');

    test()->actingAs($actor)->postJson("/api/admin/transport-schedules/{$scheduleId}/submit")->assertOk();

    $confirmResponse = test()->actingAs($actor)->postJson("/api/admin/transport-schedules/{$scheduleId}/confirm")->assertOk();

    return [$confirmResponse, TransportSchedule::query()->findOrFail($scheduleId), $destinationBranch, $actor];
}

/**
 * Creación MANUAL "anticipada" (D-RCP) + envío -- `$carrierOrganization`
 * crea/envía, `$receivingBranch` puede pertenecer a CUALQUIER organización
 * (sin la restricción de `TransportScheduleController::store()`), mismo
 * criterio explícito de esta tarea ("caso anticipada").
 */
function urManualSubmittedRequestFixture(Organization $carrierOrganization, Branch $receivingBranch): UnloadRequest
{
    $waste = Waste::factory()->create();
    $actor = urActor(['unload_requests.create', 'unload_requests.update'], $carrierOrganization->id);

    $response = test()->actingAs($actor)->postJson('/api/admin/unload-requests', [
        'receiving_branch_id' => $receivingBranch->id,
        'items' => [['waste_id' => $waste->id, 'requested_quantity' => 100]],
    ])->assertCreated();

    $unloadRequest = UnloadRequest::query()->findOrFail($response->json('unload_request.id'));

    test()->actingAs($actor)->postJson("/api/admin/unload-requests/{$unloadRequest->id}/submit")->assertOk();

    return $unloadRequest->fresh();
}

// ---- Automatización D-PRG-13 (test dedicado) ----

test('confirm() de una transport_schedule crea automáticamente una unload_request en SUBMITTED con los campos derivados correctos', function () {
    $generator = urGeneratorOrganization();
    $gestor = urGestorOrganization();
    $generatorBranch = Branch::factory()->create(['organization_id' => $generator->id]);

    [$confirmResponse, $schedule, $destinationBranch] = urConfirmedScheduleFixture($generator, $gestor, $generatorBranch);

    $confirmResponse->assertJsonPath('unload_request.unload_request_status.code', 'SUBMITTED')
        ->assertJsonPath('unload_request.carrier_organization_id', $gestor->id)
        ->assertJsonPath('unload_request.receiving_branch_id', $destinationBranch->id)
        ->assertJsonPath('unload_request.origin_branch_id', $generatorBranch->id)
        ->assertJsonPath('unload_request.transport_schedule_id', $schedule->id)
        ->assertJsonPath('unload_request.vehicle_id', $schedule->vehicle_id)
        ->assertJsonPath('unload_request.transport_personnel_id', $schedule->transport_personnel_id)
        ->assertJsonPath('unload_request.manifest_load_id', null)
        ->assertJsonPath('unload_request.service_modality', 'COLLECTION');

    $unloadRequest = UnloadRequest::query()->where('transport_schedule_id', $schedule->id)->firstOrFail();

    expect($unloadRequest->submitted_at)->not->toBeNull()
        ->and($unloadRequest->items()->count())->toBe(1);

    $log = WorkflowLog::query()
        ->where('process_type', 'UNLOAD_REQUEST')
        ->where('process_id', $unloadRequest->id)
        ->first();

    // La creación en SUBMITTED se fija vía forceFill directo (estado inicial,
    // no una transición) -- por eso NO hay WorkflowLog de creación, mismo
    // criterio que store() de ManifestLoad/TransportSchedule.
    expect($log)->toBeNull();
});

test('confirm() infiere service_modality=SELF_TRANSPORT cuando la organización que transporta ES la Generadora (autotransporte, D-PRG-04)', function () {
    $generator = urGeneratorOrganization();
    $generatorBranch = Branch::factory()->create(['organization_id' => $generator->id]);

    // D-PRG-04: el Generador adquiere también can_transport_waste.
    $transporter = BusinessRole::query()->where('code', 'TRANSPORTER')->first();

    if ($transporter !== null) {
        OrganizationBusinessRole::query()->create([
            'organization_id' => $generator->id,
            'business_role_id' => $transporter->id,
            'assigned_at' => now(),
            'is_active' => true,
        ]);
    }

    // Autotransporte: el propio Generador (con doble rol) programa el
    // transporte -- se reutiliza el fixture con $gestor=$generator.
    [$confirmResponse] = urConfirmedScheduleFixture($generator, $generator, $generatorBranch);

    $confirmResponse->assertJsonPath('unload_request.service_modality', 'SELF_TRANSPORT')
        ->assertJsonPath('unload_request.carrier_organization_id', $generator->id);
});

// ---- índice único parcial unload_requests_active_unique (hallazgo Medio, condición de carrera D-PRG-13) ----

/**
 * Hallazgo Medio (revisión de seguridad "Cita de Recepción en Planta
 * bilateral", 2026-07-19): `UnloadRequestAutomationService::createFromConfirmedSchedule()`
 * usaba un chequeo check-then-act (sin constraint de BD) para evitar crear
 * una `unload_requests` duplicada para la misma `transport_schedule_id`. Dos
 * confirmaciones concurrentes de la MISMA `TransportSchedule` podían generar
 * dos `unload_requests` para la misma programación.
 *
 * Este test invoca la lógica de creación DIRECTAMENTE dos veces para la
 * MISMA `TransportSchedule` ya confirmada (simulando que 2 invocaciones
 * concurrentes de la automatización llegaron a ejecutarse para la misma
 * programación) -- a diferencia de un error 422 (criterio correcto para
 * duplicados creados A MANO por un usuario, ver `ManifestLoadController`/
 * `TransportScheduleController::store()`), aquí el resultado esperado es
 * IDEMPOTENCIA REAL: la segunda invocación NO crea una segunda fila, recupera
 * y devuelve la MISMA fila ya creada por la primera.
 */
test('createFromConfirmedSchedule() invocado dos veces para la MISMA transport_schedule produce UNA sola unload_request, devuelta de forma idempotente', function () {
    $generator = urGeneratorOrganization();
    $gestor = urGestorOrganization();
    $generatorBranch = Branch::factory()->create(['organization_id' => $generator->id]);

    [, $schedule, , $actor] = urConfirmedScheduleFixture($generator, $gestor, $generatorBranch);

    // La primera invocación ya ocurrió DENTRO de confirm() (ver
    // urConfirmedScheduleFixture()) -- se invoca la MISMA lógica de creación
    // una SEGUNDA vez para la MISMA programación, simulando la ventana de
    // carrera de una segunda confirmación concurrente.
    $firstUnloadRequest = UnloadRequest::query()->where('transport_schedule_id', $schedule->id)->firstOrFail();

    $secondCallResult = UnloadRequestAutomationService::createFromConfirmedSchedule($schedule->fresh(), $actor);

    expect($secondCallResult->id)->toBe($firstUnloadRequest->id)
        ->and(UnloadRequest::query()->where('transport_schedule_id', $schedule->id)->count())->toBe(1);
});

/**
 * Prueba directamente, a nivel de BD, que el índice único parcial
 * `unload_requests_active_unique` (`transport_schedule_id` WHERE
 * `deleted_at IS NULL`) existe y rechaza un segundo registro activo para la
 * MISMA programación -- la red de seguridad real detrás de la idempotencia
 * de arriba, para la condición de carrera genuina (2 transacciones
 * concurrentes que ninguna ve la fila de la otra todavía).
 */
test('el índice único parcial unload_requests_active_unique rechaza una segunda fila activa para la misma transport_schedule_id', function () {
    $generator = urGeneratorOrganization();
    $gestor = urGestorOrganization();
    $generatorBranch = Branch::factory()->create(['organization_id' => $generator->id]);

    [, $schedule, $destinationBranch] = urConfirmedScheduleFixture($generator, $gestor, $generatorBranch);

    $existing = UnloadRequest::query()->where('transport_schedule_id', $schedule->id)->firstOrFail();

    expect(fn () => DB::table('unload_requests')->insert([
        'uuid' => (string) Str::uuid(),
        'tenant_organization_id' => $gestor->id,
        'request_number' => 'SOL-RACE-'.uniqid(),
        'unload_request_status_id' => $existing->unload_request_status_id,
        'receiving_branch_id' => $destinationBranch->id,
        'transport_schedule_id' => $schedule->id,
        'service_modality' => 'COLLECTION',
        'priority' => 'NORMAL',
        'is_active' => true,
        'created_at' => now(),
        'updated_at' => now(),
    ]))->toThrow(UniqueConstraintViolationException::class);
});

// ---- store(): creación manual "anticipada" (D-RCP) ----

test('store() crea una unload_request manual en DRAFT (caso anticipada, sin manifest_load_id/transport_schedule_id)', function () {
    $gestor = urGestorOrganization();
    $receivingBranch = Branch::factory()->create(['organization_id' => $gestor->id]);
    $waste = Waste::factory()->create();
    $actor = urActor(['unload_requests.create'], $gestor->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/unload-requests', [
        'receiving_branch_id' => $receivingBranch->id,
        'items' => [
            ['waste_id' => $waste->id, 'requested_quantity' => 100, 'unit_of_measure' => 'KG'],
        ],
    ])->assertCreated();

    $response->assertJsonPath('unload_request.unload_request_status.code', 'DRAFT')
        ->assertJsonPath('unload_request.carrier_organization_id', $gestor->id)
        ->assertJsonPath('unload_request.manifest_load_id', null)
        ->assertJsonPath('unload_request.transport_schedule_id', null)
        ->assertJsonPath('unload_request.items.0.waste_id', $waste->id);
});

test('store() rechaza (422) un vehicle_id que NO pertenece a la organización actora', function () {
    $gestor = urGestorOrganization();
    $foreignGestor = urGestorOrganization();
    $receivingBranch = Branch::factory()->create(['organization_id' => $gestor->id]);
    $waste = Waste::factory()->create();
    $foreignVehicle = Vehicle::factory()->create(['organization_id' => $foreignGestor->id]);
    $actor = urActor(['unload_requests.create'], $gestor->id);

    $this->actingAs($actor)->postJson('/api/admin/unload-requests', [
        'receiving_branch_id' => $receivingBranch->id,
        'vehicle_id' => $foreignVehicle->id,
        'items' => [
            ['waste_id' => $waste->id, 'requested_quantity' => 100],
        ],
    ])->assertUnprocessable()->assertJsonValidationErrors('vehicle_id');
});

test('store() rechaza (403) un actor sin el permiso unload_requests.create', function () {
    $gestor = urGestorOrganization();
    $receivingBranch = Branch::factory()->create(['organization_id' => $gestor->id]);
    $waste = Waste::factory()->create();
    $actor = urActor([], $gestor->id);

    $this->actingAs($actor)->postJson('/api/admin/unload-requests', [
        'receiving_branch_id' => $receivingBranch->id,
        'items' => [['waste_id' => $waste->id, 'requested_quantity' => 100]],
    ])->assertForbidden();
});

// ---- submit(): DRAFT -> SUBMITTED, solo lado transportador ----

test('submit() transiciona DRAFT->SUBMITTED y escribe un WorkflowLog', function () {
    $gestor = urGestorOrganization();
    $receivingBranch = Branch::factory()->create(['organization_id' => $gestor->id]);
    $unloadRequest = urManualSubmittedRequestFixture($gestor, $receivingBranch);

    expect($unloadRequest->unloadRequestStatus->code)->toBe('SUBMITTED');

    $log = WorkflowLog::query()
        ->where('process_type', 'UNLOAD_REQUEST')
        ->where('process_id', $unloadRequest->id)
        ->where('new_status', 'SUBMITTED')
        ->first();

    expect($log)->not->toBeNull()->and($log->previous_status)->toBe('DRAFT');
});

test('submit() rechaza (403) un actor que NO pertenece a la organización transportadora (anti-IDOR)', function () {
    $gestor = urGestorOrganization();
    $foreignGestor = urGestorOrganization();
    $receivingBranch = Branch::factory()->create(['organization_id' => $gestor->id]);
    $waste = Waste::factory()->create();
    $actor = urActor(['unload_requests.create'], $gestor->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/unload-requests', [
        'receiving_branch_id' => $receivingBranch->id,
        'items' => [['waste_id' => $waste->id, 'requested_quantity' => 100]],
    ])->assertCreated();

    $unloadRequest = UnloadRequest::query()->findOrFail($response->json('unload_request.id'));
    $foreignActor = urActor(['unload_requests.update'], $foreignGestor->id);

    $this->actingAs($foreignActor)->postJson("/api/admin/unload-requests/{$unloadRequest->id}/submit")->assertForbidden();
});

// ---- approve()/reject(): SUBMITTED -> APPROVED/REJECTED, solo lado receptor ----

test('approve() transiciona SUBMITTED->APPROVED y escribe un WorkflowLog (lado receptor, distinto del transportador)', function () {
    $carrier = urGestorOrganization();
    $receiver = urGestorOrganization();
    $receivingBranch = Branch::factory()->create(['organization_id' => $receiver->id]);

    $unloadRequest = urManualSubmittedRequestFixture($carrier, $receivingBranch);

    $receiverActor = urActor(['unload_requests.decide'], $receiver->id);

    $this->actingAs($receiverActor)->postJson("/api/admin/unload-requests/{$unloadRequest->id}/approve")
        ->assertOk()
        ->assertJsonPath('unload_request.unload_request_status.code', 'APPROVED');

    $log = WorkflowLog::query()
        ->where('process_type', 'UNLOAD_REQUEST')
        ->where('process_id', $unloadRequest->id)
        ->where('new_status', 'APPROVED')
        ->first();

    expect($log)->not->toBeNull()->and($log->previous_status)->toBe('SUBMITTED');
});

test('reject() transiciona SUBMITTED->REJECTED y exige rejection_reason', function () {
    $carrier = urGestorOrganization();
    $receiver = urGestorOrganization();
    $receivingBranch = Branch::factory()->create(['organization_id' => $receiver->id]);

    $unloadRequest = urManualSubmittedRequestFixture($carrier, $receivingBranch);
    $receiverActor = urActor(['unload_requests.decide'], $receiver->id);

    $this->actingAs($receiverActor)->postJson("/api/admin/unload-requests/{$unloadRequest->id}/reject", [])
        ->assertUnprocessable()->assertJsonValidationErrors('rejection_reason');

    $this->actingAs($receiverActor)->postJson("/api/admin/unload-requests/{$unloadRequest->id}/reject", [
        'rejection_reason' => 'Documentación incompleta',
    ])->assertOk()->assertJsonPath('unload_request.unload_request_status.code', 'REJECTED');

    expect($unloadRequest->fresh()->rejection_reason)->toBe('Documentación incompleta');
});

test('approve() rechaza (403) al lado TRANSPORTADOR (solo el receptor decide, RN de esta tarea)', function () {
    $carrier = urGestorOrganization();
    $receiver = urGestorOrganization();
    $receivingBranch = Branch::factory()->create(['organization_id' => $receiver->id]);

    $unloadRequest = urManualSubmittedRequestFixture($carrier, $receivingBranch);

    // El propio actor que creó/envió la solicitud (lado transportador) NO
    // puede decidir, aunque tenga el permiso `unload_requests.decide`.
    $carrierActor = urActor(['unload_requests.decide'], $carrier->id);

    $this->actingAs($carrierActor)->postJson("/api/admin/unload-requests/{$unloadRequest->id}/approve")->assertForbidden();
});

test('approve() rechaza (403) a una tercera organización ajena a ambos lados', function () {
    $carrier = urGestorOrganization();
    $receiver = urGestorOrganization();
    $receivingBranch = Branch::factory()->create(['organization_id' => $receiver->id]);

    $unloadRequest = urManualSubmittedRequestFixture($carrier, $receivingBranch);
    $foreignActor = urActor(['unload_requests.decide'], urGestorOrganization()->id);

    $this->actingAs($foreignActor)->postJson("/api/admin/unload-requests/{$unloadRequest->id}/approve")->assertForbidden();
});

test('approve() rechaza (422) una solicitud que todavía NO está SUBMITTED', function () {
    $gestor = urGestorOrganization();
    $receivingBranch = Branch::factory()->create(['organization_id' => $gestor->id]);
    $waste = Waste::factory()->create();
    $actor = urActor(['unload_requests.create', 'unload_requests.decide'], $gestor->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/unload-requests', [
        'receiving_branch_id' => $receivingBranch->id,
        'items' => [['waste_id' => $waste->id, 'requested_quantity' => 100]],
    ])->assertCreated();

    $unloadRequest = UnloadRequest::query()->findOrFail($response->json('unload_request.id'));

    $this->actingAs($actor)->postJson("/api/admin/unload-requests/{$unloadRequest->id}/approve")
        ->assertUnprocessable()->assertJsonValidationErrors('unload_request_status');
});

// ---- index()/show(): aislamiento (carrier + receptor + terceros) ----

test('index(): la organización Transportadora y la Receptora ven la solicitud; una tercera organización no', function () {
    $carrier = urGestorOrganization();
    $receiver = urGestorOrganization();
    $receivingBranch = Branch::factory()->create(['organization_id' => $receiver->id]);

    urManualSubmittedRequestFixture($carrier, $receivingBranch);

    $carrierViewer = urActor(['unload_requests.read'], $carrier->id);
    $view = $this->actingAs($carrierViewer)->getJson('/api/admin/unload-requests')->assertOk();
    expect($view->json('total'))->toBe(1);

    $receiverViewer = urActor(['unload_requests.read'], $receiver->id);
    $view2 = $this->actingAs($receiverViewer)->getJson('/api/admin/unload-requests')->assertOk();
    expect($view2->json('total'))->toBe(1);

    $foreignViewer = urActor(['unload_requests.read'], urGestorOrganization()->id);
    $view3 = $this->actingAs($foreignViewer)->getJson('/api/admin/unload-requests')->assertOk();
    expect($view3->json('total'))->toBe(0);
});

test('show(): una organización ajena a ambos lados recibe 403 (IDOR)', function () {
    $carrier = urGestorOrganization();
    $receiver = urGestorOrganization();
    $receivingBranch = Branch::factory()->create(['organization_id' => $receiver->id]);

    $unloadRequest = urManualSubmittedRequestFixture($carrier, $receivingBranch);
    $foreignActor = urActor(['unload_requests.read'], urGestorOrganization()->id);

    $this->actingAs($foreignActor)->getJson("/api/admin/unload-requests/{$unloadRequest->id}")->assertForbidden();
});

// ---- index(): anti-fuga cross-tenant, actor con tenant_organization_id=NULL (hallazgo ALTO, especialista-seguridad, 2026-07-20) ----

/**
 * `carrier_organization_id` es NULLABLE (D-PRG-02, caso "anticipada"/
 * autotransporte sin transportador asignado). Antes del fix,
 * `where('carrier_organization_id', $actor->tenant_organization_id)` con
 * `$actor->tenant_organization_id === null` se traducía a
 * `carrier_organization_id IS NULL`, exponiendo filas de CUALQUIER
 * organización con ese campo en NULL a un actor sin tenant asignado (estado
 * legítimo, ver `ServiceRequestPolicy::view()`, "usuarios sin tenant asignado
 * forman su propio grupo"). El fix fuerza lista vacía en ese caso.
 */
test('index() devuelve lista VACÍA para un actor con tenant_organization_id=NULL, aunque exista una unload_request de OTRA organización con carrier_organization_id=NULL', function () {
    $foreignReceiver = urGestorOrganization();
    $foreignBranch = Branch::factory()->create(['organization_id' => $foreignReceiver->id]);

    // carrier_organization_id NULL por defecto de fábrica -- exactamente el
    // escenario NULLABLE explotable (D-PRG-02).
    UnloadRequest::factory()->create([
        'tenant_organization_id' => $foreignReceiver->id,
        'receiving_branch_id' => $foreignBranch->id,
        'carrier_organization_id' => null,
    ]);

    $actorWithoutTenant = urActor(['unload_requests.read']);

    $response = $this->actingAs($actorWithoutTenant)->getJson('/api/admin/unload-requests')->assertOk();

    expect($response->json('total'))->toBe(0);
});
