<?php

use App\Models\Branch;
use App\Models\ManifestLoad;
use App\Models\ManifestUnload;
use App\Models\Organization;
use App\Models\OrganizationContact;
use App\Models\Person;
use App\Models\PlantReceptionSchedule;
use App\Models\Role;
use App\Models\TransportPersonnel;
use App\Models\TransportSchedule;
use App\Models\UnloadRequest;
use App\Models\UnloadRequestItem;
use App\Models\UnloadRequestStatus;
use App\Models\User;
use App\Models\UserRole;
use App\Models\Vehicle;
use App\Models\Waste;
use App\Models\WorkflowLog;
use Database\Seeders\BusinessRoleSeeder;
use Database\Seeders\ManifestLoadWorkflowSeeder;
use Database\Seeders\ManifestStatusSeeder;
use Database\Seeders\ManifestUnloadWorkflowSeeder;
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

// Módulo Manifiesto de Descargue, Fase 5 (última fase del plan) --
// ManifestUnloadController + ManifestUnloadWorkflowService +
// ManifestUnloadSignatureService. Mismo patrón de fixtures que
// ManifestLoadControllerTest/PlantReceptionScheduleControllerTest (prefijo
// `mu`).

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
    $this->seed(ManifestLoadWorkflowSeeder::class);
    $this->seed(ManifestUnloadWorkflowSeeder::class);
    $this->seed(UnloadRequestStatusSeeder::class);
    $this->seed(UnloadRequestWorkflowSeeder::class);
});

function muActor(array $codes = [], ?int $tenantOrganizationId = null): User
{
    $actor = User::factory()->create(['tenant_organization_id' => $tenantOrganizationId]);

    if ($codes !== []) {
        $role = Role::query()->where('code', 'LOGÍSTICA')->firstOrFail();

        UserRole::query()->create(['user_id' => $actor->id, 'role_id' => $role->id, 'is_active' => true]);
    }

    return $actor;
}

function muPlatformStaffActor(array $codes = []): User
{
    $platform = Organization::query()->where('is_platform_tenant', true)->first()
        ?? Organization::factory()->create(['is_platform_tenant' => true]);

    return muActor($codes, $platform->id);
}

// CORREGIDO (verificación E2E, 2026-07-20): el anti-IDOR de
// `assertPersonBelongsToOrganization()` pasó a validar pertenencia vía el
// pivote real `organization_contacts` (antes usaba la columna legacy
// `people.organization_id`, que queda NULL para contactos creados por el
// flujo vigente -- bug real reproducido en vivo). Este helper crea el
// vínculo real en vez de solo setear `Person.organization_id` -- mismo
// patrón que `tpPersonInOrganization()` en `TransportPersonnelControllerTest`.
function muPersonInOrganization(int $organizationId): Person
{
    $person = Person::factory()->create(['organization_id' => $organizationId]);

    OrganizationContact::factory()->create([
        'contact_id' => $person->id,
        'organization_id' => $organizationId,
        'is_active' => true,
    ]);

    return $person;
}

/**
 * Construye (vía HTTP real: store->submit->approve->propose->confirm) una
 * `unload_requests` YA `Approved` con una `plant_reception_schedules` activa
 * `Confirmed` -- el ciclo completo de Fase 4 ya cerrado, listo para crear un
 * `manifest_unloads` sobre ella.
 *
 * @return array{0: UnloadRequest, 1: Organization, 2: Organization, 3: User, 4: User, 5: Waste}
 */
function muApprovedUnloadRequestFixture(): array
{
    $carrier = Organization::factory()->create();
    $receiver = Organization::factory()->create();
    $receivingBranch = Branch::factory()->create(['organization_id' => $receiver->id]);
    $waste = Waste::factory()->create();
    $vehicle = Vehicle::factory()->create(['organization_id' => $carrier->id]);
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $carrier->id]);

    $carrierActor = muActor(['unload_requests.create', 'unload_requests.update', 'plant_reception_schedules.manage'], $carrier->id);
    $receiverActor = muActor([
        'unload_requests.decide', 'plant_reception_schedules.manage',
        'manifest_unloads.create', 'manifest_unloads.update', 'manifest_unloads.cancel',
    ], $receiver->id);

    $response = test()->actingAs($carrierActor)->postJson('/api/admin/unload-requests', [
        'receiving_branch_id' => $receivingBranch->id,
        'vehicle_id' => $vehicle->id,
        'transport_personnel_id' => $personnel->id,
        'items' => [['waste_id' => $waste->id, 'requested_quantity' => 100]],
    ])->assertCreated();

    $unloadRequest = UnloadRequest::query()->findOrFail($response->json('unload_request.id'));

    test()->actingAs($carrierActor)->postJson("/api/admin/unload-requests/{$unloadRequest->id}/submit")->assertOk();
    test()->actingAs($receiverActor)->postJson("/api/admin/unload-requests/{$unloadRequest->id}/approve")->assertOk();

    $proposeResponse = test()->actingAs($receiverActor)->postJson("/api/admin/unload-requests/{$unloadRequest->id}/reception-schedule", [
        'scheduled_date' => now()->addDays(2)->toDateString(),
        'scheduled_start_at' => now()->addDays(2)->setTime(8, 0)->toIso8601String(),
        'scheduled_end_at' => now()->addDays(2)->setTime(10, 0)->toIso8601String(),
    ])->assertCreated();

    test()->actingAs($carrierActor)->postJson("/api/admin/plant-reception-schedules/{$proposeResponse->json('plant_reception_schedule.id')}/confirm")->assertOk();

    return [$unloadRequest->fresh(), $carrier, $receiver, $carrierActor, $receiverActor, $waste];
}

function muInspectPayload(array $itemIds, array $overrides = []): array
{
    $items = array_map(fn ($id) => array_merge([
        'id' => $id,
        'received_quantity' => 100,
        'received_weight_kg' => 100,
    ], $overrides), $itemIds);

    return [
        'received_total_weight_kg' => 100,
        'rejected_total_weight_kg' => 0,
        'unload_completed_at' => now()->toIso8601String(),
        'items' => $items,
    ];
}

// ---- store(): creación válida + anti-IDOR + derivación automática ----

test('store crea la cabecera en DRAFT + items derivados de la unload_request', function () {
    [$unloadRequest, $carrier, $receiver, , $receiverActor, $waste] = muApprovedUnloadRequestFixture();
    $receiverPerson = muPersonInOrganization($receiver->id);

    $requestItem = $unloadRequest->items->first();

    $response = $this->actingAs($receiverActor)->postJson('/api/admin/manifest-unloads', [
        'unload_request_id' => $unloadRequest->id,
        'receiver_person_id' => $receiverPerson->id,
    ])->assertCreated();

    $response->assertJsonPath('manifest_unload.receiving_organization_id', $receiver->id)
        ->assertJsonPath('manifest_unload.receiving_branch_id', $unloadRequest->receiving_branch_id)
        ->assertJsonPath('manifest_unload.vehicle_id', $unloadRequest->vehicle_id)
        ->assertJsonPath('manifest_unload.transport_personnel_id', $unloadRequest->transport_personnel_id)
        ->assertJsonPath('manifest_unload.driver_signer_person_id', $unloadRequest->transportPersonnel->person_id)
        ->assertJsonPath('manifest_unload.unload_request_id', $unloadRequest->id)
        ->assertJsonPath('manifest_unload.manifest_load_id', null)
        ->assertJsonPath('manifest_unload.manifest_status.code', 'DRAFT')
        ->assertJsonPath('manifest_unload.items.0.waste_id', $requestItem->waste_id)
        ->assertJsonPath('manifest_unload.items.0.unload_request_item_id', $requestItem->id);

    expect(ManifestUnload::query()->where('unload_request_id', $unloadRequest->id)->exists())->toBeTrue()
        ->and((float) $response->json('manifest_unload.items.0.received_quantity'))->toBe(0.0);
});

test('store propaga manifest_load_id automáticamente cuando existe un manifiesto de cargue ACTIVO para la misma programación (D-PRG-05)', function () {
    $carrier = Organization::factory()->create();
    $receiver = Organization::factory()->create();
    $receivingBranch = Branch::factory()->create(['organization_id' => $receiver->id]);
    $vehicle = Vehicle::factory()->create(['organization_id' => $carrier->id]);
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $carrier->id]);
    $waste = Waste::factory()->create();
    $transportSchedule = TransportSchedule::factory()->create(['organization_id' => $carrier->id]);

    $manifestLoad = ManifestLoad::factory()->create([
        'transport_schedule_id' => $transportSchedule->id,
        'carrier_organization_id' => $carrier->id,
        'is_active' => true,
    ]);

    $approvedStatusId = UnloadRequestStatus::query()->where('code', 'APPROVED')->value('id');

    $unloadRequest = UnloadRequest::factory()->create([
        'unload_request_status_id' => $approvedStatusId,
        'transport_schedule_id' => $transportSchedule->id,
        'manifest_load_id' => null,
        'receiving_branch_id' => $receivingBranch->id,
        'carrier_organization_id' => $carrier->id,
        'vehicle_id' => $vehicle->id,
        'transport_personnel_id' => $personnel->id,
    ]);
    UnloadRequestItem::factory()->create(['unload_request_id' => $unloadRequest->id, 'waste_id' => $waste->id]);
    PlantReceptionSchedule::factory()->create([
        'unload_request_id' => $unloadRequest->id,
        'receiving_branch_id' => $receivingBranch->id,
        'status' => PlantReceptionSchedule::STATUS_CONFIRMED,
        'is_active' => true,
    ]);

    $receiverPerson = muPersonInOrganization($receiver->id);
    $receiverActor = muActor(['manifest_unloads.create'], $receiver->id);

    $response = $this->actingAs($receiverActor)->postJson('/api/admin/manifest-unloads', [
        'unload_request_id' => $unloadRequest->id,
        'receiver_person_id' => $receiverPerson->id,
    ])->assertCreated();

    $response->assertJsonPath('manifest_unload.manifest_load_id', $manifestLoad->id);
});

test('store rechaza (403) un actor que NO pertenece a la organización Receptora dueña de la sede de descargue (anti-IDOR)', function () {
    [$unloadRequest, , $receiver] = muApprovedUnloadRequestFixture();
    $foreignActor = muActor(['manifest_unloads.create'], Organization::factory()->create()->id);
    $foreignPerson = Person::factory()->create();

    $this->actingAs($foreignActor)->postJson('/api/admin/manifest-unloads', [
        'unload_request_id' => $unloadRequest->id,
        'receiver_person_id' => $foreignPerson->id,
    ])->assertForbidden();

    expect(ManifestUnload::query()->count())->toBe(0);
});

test('store rechaza un receiver_person_id que NO pertenece a la organización Receptora', function () {
    [$unloadRequest, $carrier, , , $receiverActor] = muApprovedUnloadRequestFixture();
    // El foreignPerson SÍ es contacto real de $carrier (organización distinta
    // a la Receptora exigida) -- escenario más representativo que una
    // persona sin ningún vínculo.
    $foreignPerson = muPersonInOrganization($carrier->id);

    $this->actingAs($receiverActor)->postJson('/api/admin/manifest-unloads', [
        'unload_request_id' => $unloadRequest->id,
        'receiver_person_id' => $foreignPerson->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('receiver_person_id');

    expect(ManifestUnload::query()->count())->toBe(0);
});

test('store rechaza (422) una unload_request que NO está Aprobada', function () {
    $carrier = Organization::factory()->create();
    $receiver = Organization::factory()->create();
    $receivingBranch = Branch::factory()->create(['organization_id' => $receiver->id]);
    $waste = Waste::factory()->create();

    $carrierActor = muActor(['unload_requests.create'], $carrier->id);
    $receiverActor = muActor(['manifest_unloads.create'], $receiver->id);
    $receiverPerson = muPersonInOrganization($receiver->id);

    $response = $this->actingAs($carrierActor)->postJson('/api/admin/unload-requests', [
        'receiving_branch_id' => $receivingBranch->id,
        'items' => [['waste_id' => $waste->id, 'requested_quantity' => 100]],
    ])->assertCreated();
    $unloadRequest = UnloadRequest::query()->findOrFail($response->json('unload_request.id'));

    // Todavía en DRAFT.
    $this->actingAs($receiverActor)->postJson('/api/admin/manifest-unloads', [
        'unload_request_id' => $unloadRequest->id,
        'receiver_person_id' => $receiverPerson->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('unload_request_id');
});

test('store rechaza (422) una unload_request Aprobada pero SIN una plant_reception_schedule Confirmada', function () {
    $carrier = Organization::factory()->create();
    $receiver = Organization::factory()->create();
    $receivingBranch = Branch::factory()->create(['organization_id' => $receiver->id]);
    $waste = Waste::factory()->create();
    $vehicle = Vehicle::factory()->create(['organization_id' => $carrier->id]);
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $carrier->id]);

    $carrierActor = muActor(['unload_requests.create', 'unload_requests.update'], $carrier->id);
    $receiverActor = muActor(['unload_requests.decide', 'manifest_unloads.create'], $receiver->id);
    $receiverPerson = muPersonInOrganization($receiver->id);

    $response = $this->actingAs($carrierActor)->postJson('/api/admin/unload-requests', [
        'receiving_branch_id' => $receivingBranch->id,
        'vehicle_id' => $vehicle->id,
        'transport_personnel_id' => $personnel->id,
        'items' => [['waste_id' => $waste->id, 'requested_quantity' => 100]],
    ])->assertCreated();
    $unloadRequest = UnloadRequest::query()->findOrFail($response->json('unload_request.id'));

    $this->actingAs($carrierActor)->postJson("/api/admin/unload-requests/{$unloadRequest->id}/submit")->assertOk();
    $this->actingAs($receiverActor)->postJson("/api/admin/unload-requests/{$unloadRequest->id}/approve")->assertOk();

    // Aprobada, pero sin franja propuesta/confirmada todavía.
    $this->actingAs($receiverActor)->postJson('/api/admin/manifest-unloads', [
        'unload_request_id' => $unloadRequest->id,
        'receiver_person_id' => $receiverPerson->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('unload_request_id');
});

test('store() rechaza (422) un segundo manifiesto para la misma unload_request mientras exista uno ACTIVO', function () {
    [$unloadRequest, , $receiver, , $receiverActor] = muApprovedUnloadRequestFixture();
    $receiverPerson = muPersonInOrganization($receiver->id);

    $this->actingAs($receiverActor)->postJson('/api/admin/manifest-unloads', [
        'unload_request_id' => $unloadRequest->id,
        'receiver_person_id' => $receiverPerson->id,
    ])->assertCreated();

    $this->actingAs($receiverActor)->postJson('/api/admin/manifest-unloads', [
        'unload_request_id' => $unloadRequest->id,
        'receiver_person_id' => $receiverPerson->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('unload_request_id');

    expect(ManifestUnload::query()->where('unload_request_id', $unloadRequest->id)->count())->toBe(1);
});

// ---- inspectItems() + generate(): RN-107/108 ----

test('generate() rechaza (422) mientras la inspección no haya registrado los pesos recibidos/rechazados (RN-107/108)', function () {
    [$unloadRequest, , $receiver, , $receiverActor] = muApprovedUnloadRequestFixture();
    $receiverPerson = muPersonInOrganization($receiver->id);

    $storeResponse = $this->actingAs($receiverActor)->postJson('/api/admin/manifest-unloads', [
        'unload_request_id' => $unloadRequest->id,
        'receiver_person_id' => $receiverPerson->id,
    ])->assertCreated();

    $manifest = ManifestUnload::query()->findOrFail($storeResponse->json('manifest_unload.id'));

    $this->actingAs($receiverActor)->postJson("/api/admin/manifest-unloads/{$manifest->id}/generate")
        ->assertUnprocessable()
        ->assertJsonValidationErrors('received_total_weight_kg');
});

test('inspectItems() registra cantidades/pesos por línea + totales de cabecera; generate() luego SÍ transiciona a GENERATED', function () {
    [$unloadRequest, , $receiver, , $receiverActor] = muApprovedUnloadRequestFixture();
    $receiverPerson = muPersonInOrganization($receiver->id);

    $storeResponse = $this->actingAs($receiverActor)->postJson('/api/admin/manifest-unloads', [
        'unload_request_id' => $unloadRequest->id,
        'receiver_person_id' => $receiverPerson->id,
    ])->assertCreated();

    $manifest = ManifestUnload::query()->findOrFail($storeResponse->json('manifest_unload.id'));
    $itemId = $manifest->items->first()->id;

    $this->actingAs($receiverActor)->postJson("/api/admin/manifest-unloads/{$manifest->id}/inspect-items", muInspectPayload([$itemId]))
        ->assertOk()
        ->assertJsonPath('manifest_unload.items.0.reception_condition', 'Conforme');

    expect((float) $manifest->fresh()->received_total_weight_kg)->toBe(100.0);

    $this->actingAs($receiverActor)->postJson("/api/admin/manifest-unloads/{$manifest->id}/generate")
        ->assertOk()
        ->assertJsonPath('manifest_unload.manifest_status.code', 'GENERATED');
});

// ---- sign(): firma bilateral (RECEIVER/DRIVER) + recálculo de estado ----

/**
 * @return array{0: ManifestUnload, 1: Organization, 2: Organization}
 */
function muGeneratedManifestFixture(): array
{
    [$unloadRequest, $carrier, $receiver, , $receiverActor] = muApprovedUnloadRequestFixture();
    $receiverPerson = muPersonInOrganization($receiver->id);

    $storeResponse = test()->actingAs($receiverActor)->postJson('/api/admin/manifest-unloads', [
        'unload_request_id' => $unloadRequest->id,
        'receiver_person_id' => $receiverPerson->id,
    ])->assertCreated();

    $manifest = ManifestUnload::query()->findOrFail($storeResponse->json('manifest_unload.id'));
    $itemId = $manifest->items->first()->id;

    test()->actingAs($receiverActor)->postJson("/api/admin/manifest-unloads/{$manifest->id}/inspect-items", muInspectPayload([$itemId]))->assertOk();
    test()->actingAs($receiverActor)->postJson("/api/admin/manifest-unloads/{$manifest->id}/generate")->assertOk();

    return [$manifest->fresh(), $carrier, $receiver];
}

test('sign(): la primera firma (DRIVER) mueve Generated->PartiallySigned; la segunda (RECEIVER) mueve a Signed', function () {
    [$manifest, $carrier, $receiver] = muGeneratedManifestFixture();

    $driverActor = muActor(['manifest_unloads.sign'], $carrier->id);
    $receiverActor = muActor(['manifest_unloads.sign'], $receiver->id);

    $this->actingAs($driverActor)->postJson("/api/admin/manifest-unloads/{$manifest->id}/sign", ['signer_type' => 'DRIVER'])
        ->assertOk()
        ->assertJsonPath('manifest_unload.manifest_status.code', 'PARTIALLY_SIGNED');

    $this->actingAs($receiverActor)->postJson("/api/admin/manifest-unloads/{$manifest->id}/sign", ['signer_type' => 'RECEIVER'])
        ->assertOk()
        ->assertJsonPath('manifest_unload.manifest_status.code', 'SIGNED');

    $logs = WorkflowLog::query()
        ->where('process_type', 'MANIFEST_UNLOAD')
        ->where('process_id', $manifest->id)
        ->orderBy('id')
        ->get();

    // generate() (DRAFT->GENERATED) + sign DRIVER + sign RECEIVER
    expect($logs)->toHaveCount(3);
    expect($logs[1]->new_status)->toBe('PARTIALLY_SIGNED');
    expect($logs[2]->new_status)->toBe('SIGNED');
});

test('sign() rechaza una segunda firma del MISMO tipo (ya firmado)', function () {
    [$manifest, $carrier] = muGeneratedManifestFixture();
    $driverActor = muActor(['manifest_unloads.sign'], $carrier->id);

    $this->actingAs($driverActor)->postJson("/api/admin/manifest-unloads/{$manifest->id}/sign", ['signer_type' => 'DRIVER'])->assertOk();

    $this->actingAs($driverActor)->postJson("/api/admin/manifest-unloads/{$manifest->id}/sign", ['signer_type' => 'DRIVER'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('signer_type');
});

test('sign() rechaza (403) firmar como RECEPTOR desde una organización que NO es la Receptora', function () {
    [$manifest] = muGeneratedManifestFixture();
    $foreignActor = muActor(['manifest_unloads.sign'], Organization::factory()->create()->id);

    $this->actingAs($foreignActor)->postJson("/api/admin/manifest-unloads/{$manifest->id}/sign", ['signer_type' => 'RECEIVER'])
        ->assertForbidden();
});

test('sign() rechaza (403) firmar como CONDUCTOR desde una organización que NO es el lado transportador de la unload_request', function () {
    [$manifest] = muGeneratedManifestFixture();
    $foreignActor = muActor(['manifest_unloads.sign'], Organization::factory()->create()->id);

    $this->actingAs($foreignActor)->postJson("/api/admin/manifest-unloads/{$manifest->id}/sign", ['signer_type' => 'DRIVER'])
        ->assertForbidden();
});

// ---- complete(): RN-193-equivalente (no cerrar sin ambas firmas) + cierre del ciclo completo ----

test('complete() rechaza (422) mientras falte cualquiera de las 2 firmas', function () {
    [$manifest, $carrier, $receiver] = muGeneratedManifestFixture();
    $driverActor = muActor(['manifest_unloads.sign'], $carrier->id);
    // `complete()` solo lo gestiona el lado RECEPTOR (ManifestUnloadPolicy::manage()) --
    // el conductor NUNCA podría llamarlo (403 antes de llegar a la guarda de
    // firmas), así que el actor de este test debe ser el receptor.
    $receiverActor = muActor(['manifest_unloads.update'], $receiver->id);

    // Solo firma el conductor -- PartiallySigned, no Signed.
    $this->actingAs($driverActor)->postJson("/api/admin/manifest-unloads/{$manifest->id}/sign", ['signer_type' => 'DRIVER'])->assertOk();

    $this->actingAs($receiverActor)->postJson("/api/admin/manifest-unloads/{$manifest->id}/complete")
        ->assertUnprocessable()
        ->assertJsonValidationErrors('manifest_status');
});

test('complete() transiciona Signed->Closed una vez completadas AMBAS firmas -- cierre del ciclo completo', function () {
    [$manifest, $carrier, $receiver] = muGeneratedManifestFixture();
    $driverActor = muActor(['manifest_unloads.sign'], $carrier->id);
    $receiverActor = muActor(['manifest_unloads.sign', 'manifest_unloads.update'], $receiver->id);

    $this->actingAs($driverActor)->postJson("/api/admin/manifest-unloads/{$manifest->id}/sign", ['signer_type' => 'DRIVER'])->assertOk();
    $this->actingAs($receiverActor)->postJson("/api/admin/manifest-unloads/{$manifest->id}/sign", ['signer_type' => 'RECEIVER'])->assertOk();

    $this->actingAs($receiverActor)->postJson("/api/admin/manifest-unloads/{$manifest->id}/complete")
        ->assertOk()
        ->assertJsonPath('manifest_unload.manifest_status.code', 'CLOSED');
});

// ---- cancel(): solo desde Generated/PartiallySigned; rechazado desde Signed/Closed ----

test('cancel() alcanzable desde Generated y escribe WorkflowLog', function () {
    [$manifest, , $receiver] = muGeneratedManifestFixture();
    $actor = muActor(['manifest_unloads.cancel'], $receiver->id);

    $this->actingAs($actor)->postJson("/api/admin/manifest-unloads/{$manifest->id}/cancel")
        ->assertOk()
        ->assertJsonPath('manifest_unload.manifest_status.code', 'CANCELLED');

    $log = WorkflowLog::query()
        ->where('process_type', 'MANIFEST_UNLOAD')
        ->where('process_id', $manifest->id)
        ->where('new_status', 'CANCELLED')
        ->first();

    expect($log)->not->toBeNull()->and($log->previous_status)->toBe('GENERATED');
});

test('cancel() alcanzable desde PartiallySigned', function () {
    [$manifest, $carrier, $receiver] = muGeneratedManifestFixture();
    $driverActor = muActor(['manifest_unloads.sign'], $carrier->id);
    $receiverActor = muActor(['manifest_unloads.cancel'], $receiver->id);

    $this->actingAs($driverActor)->postJson("/api/admin/manifest-unloads/{$manifest->id}/sign", ['signer_type' => 'DRIVER'])->assertOk();

    $this->actingAs($receiverActor)->postJson("/api/admin/manifest-unloads/{$manifest->id}/cancel")
        ->assertOk()
        ->assertJsonPath('manifest_unload.manifest_status.code', 'CANCELLED');
});

test('cancel() RECHAZA (422) desde Signed (transición inexistente)', function () {
    [$manifest, $carrier, $receiver] = muGeneratedManifestFixture();
    $driverActor = muActor(['manifest_unloads.sign'], $carrier->id);
    $receiverActor = muActor(['manifest_unloads.sign', 'manifest_unloads.cancel'], $receiver->id);

    $this->actingAs($driverActor)->postJson("/api/admin/manifest-unloads/{$manifest->id}/sign", ['signer_type' => 'DRIVER'])->assertOk();
    $this->actingAs($receiverActor)->postJson("/api/admin/manifest-unloads/{$manifest->id}/sign", ['signer_type' => 'RECEIVER'])->assertOk();

    $this->actingAs($receiverActor)->postJson("/api/admin/manifest-unloads/{$manifest->id}/cancel")
        ->assertUnprocessable()
        ->assertJsonValidationErrors('manifest_status');
});

test('cancel() RECHAZA (403) desde Closed -- ManifestUnloadPolicy::cancel() ya bloquea cualquier estado FINAL', function () {
    [$manifest, $carrier, $receiver] = muGeneratedManifestFixture();
    $driverActor = muActor(['manifest_unloads.sign'], $carrier->id);
    $receiverActor = muActor(['manifest_unloads.sign', 'manifest_unloads.update', 'manifest_unloads.cancel'], $receiver->id);

    $this->actingAs($driverActor)->postJson("/api/admin/manifest-unloads/{$manifest->id}/sign", ['signer_type' => 'DRIVER'])->assertOk();
    $this->actingAs($receiverActor)->postJson("/api/admin/manifest-unloads/{$manifest->id}/sign", ['signer_type' => 'RECEIVER'])->assertOk();
    $this->actingAs($receiverActor)->postJson("/api/admin/manifest-unloads/{$manifest->id}/complete")->assertOk();

    // A diferencia del caso "desde Signed" (donde la Policy SÍ deja pasar y
    // es el motor de Workflow el que rechaza con 422 por falta de transición
    // configurada), `Closed` es un estado FINAL (`is_final=true`) -- la
    // Policy misma (`! $manifestUnload->manifestStatus?->is_final`) ya
    // bloquea el intento con 403, antes de llegar al servicio de workflow.
    $this->actingAs($receiverActor)->postJson("/api/admin/manifest-unloads/{$manifest->id}/cancel")
        ->assertForbidden();
});

test('cancel() RECHAZA (422) desde Draft (transición inexistente)', function () {
    [$unloadRequest, , $receiver, , $receiverActor] = muApprovedUnloadRequestFixture();
    $receiverPerson = muPersonInOrganization($receiver->id);

    $storeResponse = $this->actingAs($receiverActor)->postJson('/api/admin/manifest-unloads', [
        'unload_request_id' => $unloadRequest->id,
        'receiver_person_id' => $receiverPerson->id,
    ])->assertCreated();

    $manifest = ManifestUnload::query()->findOrFail($storeResponse->json('manifest_unload.id'));
    $cancelActor = muActor(['manifest_unloads.cancel'], $receiver->id);

    $this->actingAs($cancelActor)->postJson("/api/admin/manifest-unloads/{$manifest->id}/cancel")
        ->assertUnprocessable()
        ->assertJsonValidationErrors('manifest_status');
});

// ---- files(): listado de evidencias fotográficas (subsistema `files`, MANIFEST_UNLOAD) ----
// Cierre de gap (agente frontend-web, Fase 5): mismo patrón que
// `WasteController::files()`, ver docblock de `ManifestUnloadController::files()`.

test('files(): lista evidencias activas subidas por el receptor, ordenadas más reciente primero', function () {
    [$manifest, , $receiver] = muGeneratedManifestFixture();
    $receiverActor = muActor(['manifest_unloads.read', 'manifest_unloads.update'], $receiver->id);

    $older = \App\Models\File::factory()->create([
        'entity_type' => 'MANIFEST_UNLOAD',
        'entity_id' => $manifest->id,
        'file_category' => 'PHOTO_EVIDENCE',
        'uploaded_at' => now()->subHour(),
        'is_active' => true,
    ]);
    $newer = \App\Models\File::factory()->create([
        'entity_type' => 'MANIFEST_UNLOAD',
        'entity_id' => $manifest->id,
        'file_category' => 'PHOTO_EVIDENCE',
        'uploaded_at' => now(),
        'is_active' => true,
    ]);
    // Inactivo (soft-eliminado) -- no debe aparecer.
    \App\Models\File::factory()->create([
        'entity_type' => 'MANIFEST_UNLOAD',
        'entity_id' => $manifest->id,
        'file_category' => 'PHOTO_EVIDENCE',
        'is_active' => false,
        'deleted_at' => now(),
    ]);

    $response = $this->actingAs($receiverActor)->getJson("/api/admin/manifest-unloads/{$manifest->id}/files")
        ->assertOk();

    expect($response->json('files'))->toHaveCount(2)
        ->and($response->json('files.0.id'))->toBe($newer->id)
        ->and($response->json('files.1.id'))->toBe($older->id);
});

test('files(): una organización ajena recibe 403 (IDOR)', function () {
    [$manifest] = muGeneratedManifestFixture();
    $foreignActor = muActor(['manifest_unloads.read'], Organization::factory()->create()->id);

    $this->actingAs($foreignActor)->getJson("/api/admin/manifest-unloads/{$manifest->id}/files")->assertForbidden();
});

// ---- index()/show(): aislamiento (receptor + transportador + platform staff) ----

test('index(): la organización Receptora y el lado transportador ven el manifiesto; una tercera organización no', function () {
    [$manifest, $carrier, $receiver] = muGeneratedManifestFixture();

    $receiverViewer = muActor(['manifest_unloads.read'], $receiver->id);
    $view = $this->actingAs($receiverViewer)->getJson('/api/admin/manifest-unloads')->assertOk();
    expect($view->json('total'))->toBe(1);

    $carrierViewer = muActor(['manifest_unloads.read'], $carrier->id);
    $view2 = $this->actingAs($carrierViewer)->getJson('/api/admin/manifest-unloads')->assertOk();
    expect($view2->json('total'))->toBe(1);

    $foreignViewer = muActor(['manifest_unloads.read'], Organization::factory()->create()->id);
    $view3 = $this->actingAs($foreignViewer)->getJson('/api/admin/manifest-unloads')->assertOk();
    expect($view3->json('total'))->toBe(0);
});

test('show(): una organización ajena recibe 403 (IDOR)', function () {
    [$manifest] = muGeneratedManifestFixture();

    $foreignActor = muActor(['manifest_unloads.read'], Organization::factory()->create()->id);

    $this->actingAs($foreignActor)->getJson("/api/admin/manifest-unloads/{$manifest->id}")->assertForbidden();
});

test('show(): el lado transportador (solo lectura) SÍ puede ver el manifiesto pero NO gestionar transiciones', function () {
    [$manifest, $carrier] = muGeneratedManifestFixture();
    $carrierActor = muActor(['manifest_unloads.read'], $carrier->id);

    $this->actingAs($carrierActor)->getJson("/api/admin/manifest-unloads/{$manifest->id}")->assertOk();

    // Sin manifest_unloads.update -- 403 aunque tuviera el permiso, el
    // transportador no es la organización receptora dueña del manifiesto.
    $carrierActorWithUpdate = muActor(['manifest_unloads.update'], $carrier->id);
    $this->actingAs($carrierActorWithUpdate)->postJson("/api/admin/manifest-unloads/{$manifest->id}/generate")->assertForbidden();
});

// ---- LOGÍSTICA real (RolePermissionSeeder de producción) ----

test('un actor con SOLO el rol LOGÍSTICA real completa store->inspect->generate->sign(driver)->sign(receiver)->complete', function () {
    [$unloadRequest, $carrier, $receiver] = muApprovedUnloadRequestFixture();
    $receiverPerson = muPersonInOrganization($receiver->id);

    $receiverActor = muActor(['manifest_unloads.create'], $receiver->id);
    $driverActor = muActor(['manifest_unloads.sign'], $carrier->id);

    expect($receiverActor->hasRole('LOGÍSTICA'))->toBeTrue()
        ->and($receiverActor->hasRole('ADMINISTRADOR'))->toBeFalse();

    $storeResponse = $this->actingAs($receiverActor)->postJson('/api/admin/manifest-unloads', [
        'unload_request_id' => $unloadRequest->id,
        'receiver_person_id' => $receiverPerson->id,
    ])->assertCreated();

    $manifest = ManifestUnload::query()->findOrFail($storeResponse->json('manifest_unload.id'));
    $itemId = $manifest->items->first()->id;

    $this->actingAs($receiverActor)->postJson("/api/admin/manifest-unloads/{$manifest->id}/inspect-items", muInspectPayload([$itemId]))->assertOk();

    $this->actingAs($receiverActor)->postJson("/api/admin/manifest-unloads/{$manifest->id}/generate")
        ->assertOk()->assertJsonPath('manifest_unload.manifest_status.code', 'GENERATED');

    $this->actingAs($driverActor)->postJson("/api/admin/manifest-unloads/{$manifest->id}/sign", ['signer_type' => 'DRIVER'])
        ->assertOk()->assertJsonPath('manifest_unload.manifest_status.code', 'PARTIALLY_SIGNED');

    $this->actingAs($receiverActor)->postJson("/api/admin/manifest-unloads/{$manifest->id}/sign", ['signer_type' => 'RECEIVER'])
        ->assertOk()->assertJsonPath('manifest_unload.manifest_status.code', 'SIGNED');

    $this->actingAs($receiverActor)->postJson("/api/admin/manifest-unloads/{$manifest->id}/complete")
        ->assertOk()->assertJsonPath('manifest_unload.manifest_status.code', 'CLOSED');
});
