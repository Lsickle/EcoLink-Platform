<?php

use App\Models\Branch;
use App\Models\BranchLocation;
use App\Models\Organization;
use App\Models\PlantReceptionSchedule;
use App\Models\Role;
use App\Models\UnloadRequest;
use App\Models\User;
use App\Models\UserRole;
use App\Models\Waste;
use App\Models\WorkflowLog;
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

// Fase 4 "Cita de Recepción en Planta (bilateral)" --
// PlantReceptionScheduleController + PlantReceptionScheduleService. Prefijo
// `prs` (Plant Reception Schedule) para no colisionar con `ur`/`ts`/`ml`.

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

function prsActor(array $codes = [], ?int $tenantOrganizationId = null): User
{
    $actor = User::factory()->create(['tenant_organization_id' => $tenantOrganizationId]);

    if ($codes !== []) {
        $role = Role::query()->where('code', 'LOGÍSTICA')->firstOrFail();

        UserRole::query()->create(['user_id' => $actor->id, 'role_id' => $role->id, 'is_active' => true]);
    }

    return $actor;
}

/**
 * Mismo patrón que `tsPlatformStaffActor()` (TransportScheduleControllerTest)
 * -- actor cuyo `tenant_organization_id` es el tenant EcoLink
 * (`is_platform_tenant=true`, sembrado por `PlatformOrganizationSeeder`).
 */
function prsPlatformStaffActor(array $codes = []): User
{
    $platform = Organization::query()->where('is_platform_tenant', true)->first()
        ?? Organization::factory()->create(['is_platform_tenant' => true]);

    return prsActor($codes, $platform->id);
}

/**
 * Construye una `unload_request` manual, la envía y la APRUEBA (RN-RCP-015)
 * -- devuelve la solicitud aprobada + ambos actores (carrier/receiver).
 *
 * @return array{0: UnloadRequest, 1: Organization, 2: Organization, 3: User, 4: User}
 */
function prsApprovedRequestFixture(): array
{
    $carrier = Organization::factory()->create();
    $receiver = Organization::factory()->create();
    $receivingBranch = Branch::factory()->create(['organization_id' => $receiver->id]);
    $waste = Waste::factory()->create();

    $carrierActor = prsActor(['unload_requests.create', 'unload_requests.update', 'plant_reception_schedules.manage', 'plant_reception_schedules.read'], $carrier->id);
    $receiverActor = prsActor(['unload_requests.decide', 'plant_reception_schedules.manage', 'plant_reception_schedules.read'], $receiver->id);

    $response = test()->actingAs($carrierActor)->postJson('/api/admin/unload-requests', [
        'receiving_branch_id' => $receivingBranch->id,
        'items' => [['waste_id' => $waste->id, 'requested_quantity' => 100]],
    ])->assertCreated();

    $unloadRequest = UnloadRequest::query()->findOrFail($response->json('unload_request.id'));

    test()->actingAs($carrierActor)->postJson("/api/admin/unload-requests/{$unloadRequest->id}/submit")->assertOk();
    test()->actingAs($receiverActor)->postJson("/api/admin/unload-requests/{$unloadRequest->id}/approve")->assertOk();

    return [$unloadRequest->fresh(), $carrier, $receiver, $carrierActor, $receiverActor];
}

function prsSlotPayload(?int $dockLocationId = null): array
{
    return [
        'dock_location_id' => $dockLocationId,
        'scheduled_date' => now()->addDays(2)->toDateString(),
        'scheduled_start_at' => now()->addDays(2)->setTime(8, 0)->toIso8601String(),
        'scheduled_end_at' => now()->addDays(2)->setTime(10, 0)->toIso8601String(),
    ];
}

// ---- propose(): primera propuesta, solo sobre unload_request Aprobada ----

test('propose() crea la primera franja para una solicitud APROBADA', function () {
    [$unloadRequest, , $receiver, , $receiverActor] = prsApprovedRequestFixture();

    $response = $this->actingAs($receiverActor)->postJson("/api/admin/unload-requests/{$unloadRequest->id}/reception-schedule", prsSlotPayload())
        ->assertCreated();

    $response->assertJsonPath('plant_reception_schedule.status', 'PROPOSED')
        ->assertJsonPath('plant_reception_schedule.proposed_by_role', 'RECEPTION_COORDINATOR')
        ->assertJsonPath('plant_reception_schedule.unload_request_id', $unloadRequest->id);

    $log = WorkflowLog::query()->where('process_type', 'PLANT_RECEPTION_SCHEDULE')->where('new_status', 'PROPOSED')->first();
    expect($log)->not->toBeNull();
});

test('propose() rechaza (422) sobre una unload_request que NO está Aprobada (RN-RCP-015)', function () {
    $carrier = Organization::factory()->create();
    $receiver = Organization::factory()->create();
    $receivingBranch = Branch::factory()->create(['organization_id' => $receiver->id]);
    $waste = Waste::factory()->create();

    $carrierActor = prsActor(['unload_requests.create', 'plant_reception_schedules.manage'], $carrier->id);

    $response = $this->actingAs($carrierActor)->postJson('/api/admin/unload-requests', [
        'receiving_branch_id' => $receivingBranch->id,
        'items' => [['waste_id' => $waste->id, 'requested_quantity' => 100]],
    ])->assertCreated();

    $unloadRequest = UnloadRequest::query()->findOrFail($response->json('unload_request.id'));

    // Todavía en DRAFT -- ni siquiera enviada.
    $this->actingAs($carrierActor)->postJson("/api/admin/unload-requests/{$unloadRequest->id}/reception-schedule", prsSlotPayload())
        ->assertUnprocessable()->assertJsonValidationErrors('unload_request_id');
});

test('propose() rechaza (403) a una tercera organización ajena a ambos lados', function () {
    [$unloadRequest] = prsApprovedRequestFixture();
    $foreignActor = prsActor(['plant_reception_schedules.manage'], Organization::factory()->create()->id);

    $this->actingAs($foreignActor)->postJson("/api/admin/unload-requests/{$unloadRequest->id}/reception-schedule", prsSlotPayload())
        ->assertForbidden();
});

test('propose() rechaza (422) una segunda propuesta mientras ya exista una franja vigente', function () {
    [$unloadRequest, , , $carrierActor, $receiverActor] = prsApprovedRequestFixture();

    $this->actingAs($receiverActor)->postJson("/api/admin/unload-requests/{$unloadRequest->id}/reception-schedule", prsSlotPayload())->assertCreated();

    $this->actingAs($carrierActor)->postJson("/api/admin/unload-requests/{$unloadRequest->id}/reception-schedule", prsSlotPayload())
        ->assertUnprocessable()->assertJsonValidationErrors('unload_request_id');
});

// ---- counterPropose(): la otra parte contrapropone ----

test('counterPropose() mueve la franja a COUNTER_PROPOSED', function () {
    [$unloadRequest, , , $carrierActor, $receiverActor] = prsApprovedRequestFixture();

    $proposeResponse = $this->actingAs($receiverActor)->postJson("/api/admin/unload-requests/{$unloadRequest->id}/reception-schedule", prsSlotPayload())->assertCreated();
    $scheduleId = $proposeResponse->json('plant_reception_schedule.id');

    $counterPayload = [
        'counter_proposed_date' => now()->addDays(3)->toDateString(),
        'counter_proposed_start_at' => now()->addDays(3)->setTime(9, 0)->toIso8601String(),
        'counter_proposed_end_at' => now()->addDays(3)->setTime(11, 0)->toIso8601String(),
    ];

    $this->actingAs($carrierActor)->postJson("/api/admin/plant-reception-schedules/{$scheduleId}/counter-propose", $counterPayload)
        ->assertOk()
        ->assertJsonPath('plant_reception_schedule.status', 'COUNTER_PROPOSED');

    $log = WorkflowLog::query()->where('process_type', 'PLANT_RECEPTION_SCHEDULE')->where('new_status', 'COUNTER_PROPOSED')->first();
    expect($log)->not->toBeNull();
});

test('counterPropose() rechaza (403) a una organización ajena', function () {
    [$unloadRequest, , , , $receiverActor] = prsApprovedRequestFixture();

    $proposeResponse = $this->actingAs($receiverActor)->postJson("/api/admin/unload-requests/{$unloadRequest->id}/reception-schedule", prsSlotPayload())->assertCreated();
    $scheduleId = $proposeResponse->json('plant_reception_schedule.id');

    $foreignActor = prsActor(['plant_reception_schedules.manage'], Organization::factory()->create()->id);

    $this->actingAs($foreignActor)->postJson("/api/admin/plant-reception-schedules/{$scheduleId}/counter-propose", [
        'counter_proposed_date' => now()->addDays(3)->toDateString(),
        'counter_proposed_start_at' => now()->addDays(3)->setTime(9, 0)->toIso8601String(),
        'counter_proposed_end_at' => now()->addDays(3)->setTime(11, 0)->toIso8601String(),
    ])->assertForbidden();
});

// ---- confirm(): cualquiera de las 2 partes acepta la franja vigente ----

test('confirm() sobre una franja PROPOSED la marca CONFIRMED', function () {
    [$unloadRequest, , , $carrierActor, $receiverActor] = prsApprovedRequestFixture();

    $proposeResponse = $this->actingAs($receiverActor)->postJson("/api/admin/unload-requests/{$unloadRequest->id}/reception-schedule", prsSlotPayload())->assertCreated();
    $scheduleId = $proposeResponse->json('plant_reception_schedule.id');

    $this->actingAs($carrierActor)->postJson("/api/admin/plant-reception-schedules/{$scheduleId}/confirm")
        ->assertOk()
        ->assertJsonPath('plant_reception_schedule.status', 'CONFIRMED');

    expect(PlantReceptionSchedule::query()->findOrFail($scheduleId)->confirmed_by)->toBe($carrierActor->id);
});

test('confirm() sobre una franja COUNTER_PROPOSED promueve la contrapropuesta a scheduled_*', function () {
    [$unloadRequest, , , $carrierActor, $receiverActor] = prsApprovedRequestFixture();

    $proposeResponse = $this->actingAs($receiverActor)->postJson("/api/admin/unload-requests/{$unloadRequest->id}/reception-schedule", prsSlotPayload())->assertCreated();
    $scheduleId = $proposeResponse->json('plant_reception_schedule.id');

    $counterDate = now()->addDays(3)->toDateString();

    $this->actingAs($carrierActor)->postJson("/api/admin/plant-reception-schedules/{$scheduleId}/counter-propose", [
        'counter_proposed_date' => $counterDate,
        'counter_proposed_start_at' => now()->addDays(3)->setTime(9, 0)->toIso8601String(),
        'counter_proposed_end_at' => now()->addDays(3)->setTime(11, 0)->toIso8601String(),
    ])->assertOk();

    $this->actingAs($receiverActor)->postJson("/api/admin/plant-reception-schedules/{$scheduleId}/confirm")
        ->assertOk()
        ->assertJsonPath('plant_reception_schedule.status', 'CONFIRMED');

    $schedule = PlantReceptionSchedule::query()->findOrFail($scheduleId);
    expect($schedule->scheduled_date->toDateString())->toBe($counterDate);
});

test('confirm() rechaza (422) una franja ya CONFIRMED', function () {
    [$unloadRequest, , , $carrierActor, $receiverActor] = prsApprovedRequestFixture();

    $proposeResponse = $this->actingAs($receiverActor)->postJson("/api/admin/unload-requests/{$unloadRequest->id}/reception-schedule", prsSlotPayload())->assertCreated();
    $scheduleId = $proposeResponse->json('plant_reception_schedule.id');

    $this->actingAs($carrierActor)->postJson("/api/admin/plant-reception-schedules/{$scheduleId}/confirm")->assertOk();

    $this->actingAs($carrierActor)->postJson("/api/admin/plant-reception-schedules/{$scheduleId}/confirm")
        ->assertUnprocessable()->assertJsonValidationErrors('status');
});

// ---- confirm(): anti-auto-confirmación (hallazgo Alto, revisión de seguridad 2026-07-19) ----

test('confirm() rechaza (422) cuando el actor pertenece a la MISMA organización que hizo la última propuesta vigente', function () {
    [$unloadRequest, , $receiver, , $receiverActor] = prsApprovedRequestFixture();

    $proposeResponse = $this->actingAs($receiverActor)->postJson("/api/admin/unload-requests/{$unloadRequest->id}/reception-schedule", prsSlotPayload())->assertCreated();
    $scheduleId = $proposeResponse->json('plant_reception_schedule.id');

    // Otro miembro del MISMO lado (receptor) que propuso -- no es el mismo
    // usuario, pero SÍ la misma organización, y por lo tanto no puede
    // confirmar unilateralmente su propia propuesta.
    $sameSideActor = prsActor(['plant_reception_schedules.manage'], $receiver->id);

    $this->actingAs($sameSideActor)->postJson("/api/admin/plant-reception-schedules/{$scheduleId}/confirm")
        ->assertUnprocessable()->assertJsonValidationErrors('confirmed_by');

    expect(PlantReceptionSchedule::query()->findOrFail($scheduleId)->status)->toBe('PROPOSED');
});

test('confirm() rechaza (422) cuando el actor pertenece a la MISMA organización que hizo la última CONTRApropuesta vigente', function () {
    [$unloadRequest, $carrier, , $carrierActor, $receiverActor] = prsApprovedRequestFixture();

    $proposeResponse = $this->actingAs($receiverActor)->postJson("/api/admin/unload-requests/{$unloadRequest->id}/reception-schedule", prsSlotPayload())->assertCreated();
    $scheduleId = $proposeResponse->json('plant_reception_schedule.id');

    $this->actingAs($carrierActor)->postJson("/api/admin/plant-reception-schedules/{$scheduleId}/counter-propose", [
        'counter_proposed_date' => now()->addDays(3)->toDateString(),
        'counter_proposed_start_at' => now()->addDays(3)->setTime(9, 0)->toIso8601String(),
        'counter_proposed_end_at' => now()->addDays(3)->setTime(11, 0)->toIso8601String(),
    ])->assertOk();

    // Otro miembro del lado transportador (que contrapropuso) intenta
    // confirmar su PROPIA contrapropuesta -- rechazado.
    $sameSideActor = prsActor(['plant_reception_schedules.manage'], $carrier->id);

    $this->actingAs($sameSideActor)->postJson("/api/admin/plant-reception-schedules/{$scheduleId}/confirm")
        ->assertUnprocessable()->assertJsonValidationErrors('confirmed_by');

    expect(PlantReceptionSchedule::query()->findOrFail($scheduleId)->status)->toBe('COUNTER_PROPOSED');
});

test('confirm() permite a un actor de PLATFORM STAFF confirmar aunque sea "del mismo lado" (criterio documentado: override universal)', function () {
    [$unloadRequest, , , , $receiverActor] = prsApprovedRequestFixture();

    $proposeResponse = $this->actingAs($receiverActor)->postJson("/api/admin/unload-requests/{$unloadRequest->id}/reception-schedule", prsSlotPayload())->assertCreated();
    $scheduleId = $proposeResponse->json('plant_reception_schedule.id');

    $platformActor = prsPlatformStaffActor(['plant_reception_schedules.manage']);

    $this->actingAs($platformActor)->postJson("/api/admin/plant-reception-schedules/{$scheduleId}/confirm")
        ->assertOk()
        ->assertJsonPath('plant_reception_schedule.status', 'CONFIRMED');

    expect(PlantReceptionSchedule::query()->findOrFail($scheduleId)->confirmed_by)->toBe($platformActor->id);
});

test('confirm() exitoso escribe un WorkflowLog cuya descripción refleja la organización que confirmó realmente (no "ambas partes")', function () {
    [$unloadRequest, , , $carrierActor, $receiverActor] = prsApprovedRequestFixture();

    $proposeResponse = $this->actingAs($receiverActor)->postJson("/api/admin/unload-requests/{$unloadRequest->id}/reception-schedule", prsSlotPayload())->assertCreated();
    $scheduleId = $proposeResponse->json('plant_reception_schedule.id');

    // El carrier confirma la propuesta hecha por el receiver -- lado opuesto,
    // confirmación legítima.
    $this->actingAs($carrierActor)->postJson("/api/admin/plant-reception-schedules/{$scheduleId}/confirm")->assertOk();

    $log = WorkflowLog::query()
        ->where('process_type', 'PLANT_RECEPTION_SCHEDULE')
        ->where('process_id', $scheduleId)
        ->where('new_status', 'CONFIRMED')
        ->firstOrFail();

    expect($log->description)->not->toContain('ambas partes')
        ->and($log->description)->toContain($carrierActor->tenantOrganization->legal_name);
});

// ---- reschedule(): solo sobre franja ya CONFIRMED ----

test('reschedule() apaga la franja anterior (SUPERSEDED) y crea una nueva PROPOSED con parent_schedule_id/version_number', function () {
    [$unloadRequest, , , $carrierActor, $receiverActor] = prsApprovedRequestFixture();

    $proposeResponse = $this->actingAs($receiverActor)->postJson("/api/admin/unload-requests/{$unloadRequest->id}/reception-schedule", prsSlotPayload())->assertCreated();
    $scheduleId = $proposeResponse->json('plant_reception_schedule.id');

    $this->actingAs($carrierActor)->postJson("/api/admin/plant-reception-schedules/{$scheduleId}/confirm")->assertOk();

    $newResponse = $this->actingAs($receiverActor)->postJson("/api/admin/plant-reception-schedules/{$scheduleId}/reschedule", [
        ...prsSlotPayload(),
        'scheduled_date' => now()->addDays(5)->toDateString(),
        'reschedule_reason' => 'Cambio de disponibilidad de planta',
    ])->assertCreated();

    $newResponse->assertJsonPath('plant_reception_schedule.status', 'PROPOSED')
        ->assertJsonPath('plant_reception_schedule.parent_schedule_id', $scheduleId)
        ->assertJsonPath('plant_reception_schedule.version_number', 2);

    $old = PlantReceptionSchedule::query()->findOrFail($scheduleId);
    expect($old->status)->toBe('SUPERSEDED')
        ->and($old->is_active)->toBeFalse();

    // Solo la fila NUEVA queda como "vigente" para la solicitud.
    expect($unloadRequest->fresh()->activeReceptionSchedule()->firstOrFail()->id)->toBe($newResponse->json('plant_reception_schedule.id'));
});

test('reschedule() rechaza (422) una franja que NO está CONFIRMED todavía', function () {
    [$unloadRequest, , , $carrierActor, $receiverActor] = prsApprovedRequestFixture();

    $proposeResponse = $this->actingAs($receiverActor)->postJson("/api/admin/unload-requests/{$unloadRequest->id}/reception-schedule", prsSlotPayload())->assertCreated();
    $scheduleId = $proposeResponse->json('plant_reception_schedule.id');

    $this->actingAs($carrierActor)->postJson("/api/admin/plant-reception-schedules/{$scheduleId}/reschedule", [
        ...prsSlotPayload(),
        'reschedule_reason' => 'Intento prematuro',
    ])->assertUnprocessable()->assertJsonValidationErrors('status');
});

// ---- anti-IDOR de dock_location_id ----

test('propose() rechaza (422) un dock_location_id que NO pertenece a la sede receptora', function () {
    [$unloadRequest, , , , $receiverActor] = prsApprovedRequestFixture();

    $foreignBranch = Branch::factory()->create();
    $foreignDock = BranchLocation::factory()->create(['branch_id' => $foreignBranch->id]);

    $this->actingAs($receiverActor)->postJson("/api/admin/unload-requests/{$unloadRequest->id}/reception-schedule", prsSlotPayload($foreignDock->id))
        ->assertUnprocessable()->assertJsonValidationErrors('dock_location_id');
});

// ---- show(): aislamiento ----

test('show(): una organización ajena a ambos lados recibe 403 (IDOR)', function () {
    [$unloadRequest, , , , $receiverActor] = prsApprovedRequestFixture();

    $this->actingAs($receiverActor)->postJson("/api/admin/unload-requests/{$unloadRequest->id}/reception-schedule", prsSlotPayload())->assertCreated();

    $foreignActor = prsActor(['plant_reception_schedules.read'], Organization::factory()->create()->id);

    $this->actingAs($foreignActor)->getJson("/api/admin/unload-requests/{$unloadRequest->id}/reception-schedule")->assertForbidden();
});
