<?php

use App\Models\Branch;
use App\Models\BusinessRole;
use App\Models\CancellationReason;
use App\Models\CarteraStatus;
use App\Models\MeasurementUnit;
use App\Models\Organization;
use App\Models\OrganizationBusinessRole;
use App\Models\OrganizationCarteraStatus;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\SecurityLog;
use App\Models\User;
use App\Models\UserRole;
use App\Models\Waste;
use App\Models\WasteServiceRequest;
use App\Models\WasteServiceRequestItem;
use App\Models\WasteTreatmentApproval;
use App\Models\WorkflowLog;
use Database\Seeders\BusinessRoleSeeder;
use Database\Seeders\CancellationReasonSeeder;
use Database\Seeders\CarteraStatusSeeder;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\PlatformOrganizationSeeder;
use Database\Seeders\RespelStatusSeeder;
use Database\Seeders\RoleSeeder;
use Database\Seeders\ServiceItemStatusSeeder;
use Database\Seeders\ServiceRequestWorkflowSeeder;
use Database\Seeders\ServiceStatusSeeder;

// Fase 1b del Módulo Solicitudes de Servicio (D-S01/D-S02/D-S04/D-S06/D-S09/
// D-S12/D-S25/D-S27) -- controller + ServiceRequestApprovalService.
// RespelStatusSeeder se necesita porque WasteTreatmentApproval::technical_status/
// commercial_status son atributos virtuales que resuelven `respel_statuses`
// (ver docblock del modelo).
beforeEach(function () {
    $this->seed(OrganizationStatusSeeder::class);
    $this->seed(PlatformOrganizationSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->seed(BusinessRoleSeeder::class);
    $this->seed(RespelStatusSeeder::class);
    $this->seed(ServiceStatusSeeder::class);
    $this->seed(ServiceItemStatusSeeder::class);
    $this->seed(CancellationReasonSeeder::class);
    $this->seed(CarteraStatusSeeder::class);
    $this->seed(ServiceRequestWorkflowSeeder::class);
});

function srActor(array $codes = [], ?int $tenantOrganizationId = null): User
{
    $actor = User::factory()->create(['tenant_organization_id' => $tenantOrganizationId]);

    if ($codes !== []) {
        $role = Role::factory()->create();

        foreach ($codes as $code) {
            $permission = Permission::query()->firstOrCreate(['code' => $code], [
                'name' => $code, 'module' => explode('.', $code)[0], 'action' => explode('.', $code)[1] ?? $code,
                'scope' => 'tenant', 'is_system' => true, 'is_active' => true,
            ]);
            RolePermission::query()->create(['role_id' => $role->id, 'permission_id' => $permission->id, 'is_active' => true]);
        }

        UserRole::query()->create(['user_id' => $actor->id, 'role_id' => $role->id, 'is_active' => true]);
    }

    return $actor;
}

function srPlatformStaffActor(array $codes = []): User
{
    $platform = Organization::query()->where('is_platform_tenant', true)->first()
        ?? Organization::factory()->create(['is_platform_tenant' => true]);

    return srActor($codes, $platform->id);
}

/**
 * Organización con business_role GENERATOR REAL (el mismo sembrado por
 * BusinessRoleSeeder/consumido por ServiceRequestWorkflowSeeder) -- NO un
 * business_role ad-hoc de factory, porque las transiciones de workflow
 * (DRAFT->SUBMITTED, CANCELLED) están autorizadas exactamente contra ESE id.
 */
function srGeneratorOrganization(): Organization
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
 * Mismo criterio que srGeneratorOrganization(), business_role GESTOR real.
 */
function srGestorOrganization(): Organization
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
 * Residuo del Generador + aprobación VIABLE (ambos ejes APPROVED) de un
 * Gestor concreto -- building block reutilizado por casi todos los tests.
 */
function srViableItemFixture(Organization $generator, Organization $gestor): array
{
    $waste = Waste::factory()->create(['organization_id' => $generator->id]);
    $approval = WasteTreatmentApproval::factory()->viable()->create([
        'organization_id' => $gestor->id,
        'waste_id' => $waste->id,
    ]);

    return [$waste, $approval];
}

function srItemPayload(Waste $waste, ?WasteTreatmentApproval $approval = null): array
{
    return [
        'waste_id' => $waste->id,
        'waste_treatment_approval_id' => $approval?->id,
        'estimated_quantity' => 50,
        'measurement_unit_id' => MeasurementUnit::factory()->create()->id,
    ];
}

// ---- store(): creación + validaciones anti-IDOR + cartera bilateral ----

test('store crea la cabecera en DRAFT + ítems, con item_status PENDING', function () {
    $generator = srGeneratorOrganization();
    $gestor = srGestorOrganization();
    [$waste, $approval] = srViableItemFixture($generator, $gestor);
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);

    $actor = srActor(['service_requests.create'], $generator->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertCreated();

    $response->assertJsonPath('service_request.organization_id', $generator->id)
        ->assertJsonPath('service_request.service_status.code', 'DRAFT')
        ->assertJsonPath('service_request.items.0.waste_treatment_approval_id', $approval->id)
        ->assertJsonPath('service_request.items.0.waste_id', $waste->id);

    $item = WasteServiceRequestItem::query()->where('waste_id', $waste->id)->firstOrFail();
    expect($item->itemStatus->code)->toBe('PENDING');
});

test('store rechaza un waste_id que NO pertenece a la organización actora (IDOR)', function () {
    $generator = srGeneratorOrganization();
    $otherOrganization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $otherOrganization->id]);
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);

    $actor = srActor(['service_requests.create'], $generator->id);

    $this->actingAs($actor)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'items' => [srItemPayload($waste)],
    ])->assertUnprocessable()->assertJsonValidationErrors('items.0.waste_id');
});

test('store rechaza un waste_treatment_approval_id que pertenece a OTRO residuo (IDOR de aprobación ajena)', function () {
    $generator = srGeneratorOrganization();
    $gestor = srGestorOrganization();
    [$waste] = srViableItemFixture($generator, $gestor);

    // Aprobación viable, pero de un residuo DISTINTO.
    [, $foreignApproval] = srViableItemFixture($generator, $gestor);

    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $actor = srActor(['service_requests.create'], $generator->id);

    $this->actingAs($actor)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'items' => [srItemPayload($waste, $foreignApproval)],
    ])->assertUnprocessable()->assertJsonValidationErrors('items.0.waste_treatment_approval_id');
});

test('store rechaza una aprobación SIN ambos ejes aprobados (tratamiento no viable)', function () {
    $generator = srGeneratorOrganization();
    $gestor = srGestorOrganization();
    $waste = Waste::factory()->create(['organization_id' => $generator->id]);
    $approval = WasteTreatmentApproval::factory()->create([
        'organization_id' => $gestor->id,
        'waste_id' => $waste->id,
        'technical_status' => 'APPROVED',
        'commercial_status' => 'DRAFT',
    ]);

    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $actor = srActor(['service_requests.create'], $generator->id);

    $this->actingAs($actor)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertUnprocessable()->assertJsonValidationErrors('items.0.waste_treatment_approval_id');
});

test('store rechaza cuando la cartera Generador<->Gestor está bloqueada (D-S04/D-S12)', function () {
    $generator = srGeneratorOrganization();
    $gestor = srGestorOrganization();
    [$waste, $approval] = srViableItemFixture($generator, $gestor);

    $blockedStatus = CarteraStatus::query()->where('code', 'EN_COBRO')->firstOrFail();
    OrganizationCarteraStatus::query()->create([
        'generator_organization_id' => $generator->id,
        'gestor_organization_id' => $gestor->id,
        'cartera_status_id' => $blockedStatus->id,
        'is_active' => true,
    ]);

    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $actor = srActor(['service_requests.create'], $generator->id);

    $this->actingAs($actor)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertUnprocessable()->assertJsonValidationErrors('items.0.waste_treatment_approval_id');

    expect(WasteServiceRequest::query()->count())->toBe(0);
});

test('store permite crear cuando la cartera está en un estado que NO bloquea (ej. AL_DIA)', function () {
    $generator = srGeneratorOrganization();
    $gestor = srGestorOrganization();
    [$waste, $approval] = srViableItemFixture($generator, $gestor);

    $okStatus = CarteraStatus::query()->where('code', 'AL_DIA')->firstOrFail();
    OrganizationCarteraStatus::query()->create([
        'generator_organization_id' => $generator->id,
        'gestor_organization_id' => $gestor->id,
        'cartera_status_id' => $okStatus->id,
        'is_active' => true,
    ]);

    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $actor = srActor(['service_requests.create'], $generator->id);

    $this->actingAs($actor)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertCreated();
});

test('store rechaza si la organización actora NO tiene la capacidad can_generate_waste', function () {
    $nonGenerator = Organization::factory()->create();
    $branch = Branch::factory()->create(['organization_id' => $nonGenerator->id]);
    $waste = Waste::factory()->create(['organization_id' => $nonGenerator->id]);

    $actor = srActor(['service_requests.create'], $nonGenerator->id);

    $this->actingAs($actor)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'items' => [srItemPayload($waste)],
    ])->assertForbidden();
});

// ---- submit(): validación de campos completos + transición automática ----

test('submit exige waste_treatment_approval_id/estimated_quantity/measurement_unit_id completos en TODOS los ítems', function () {
    $generator = srGeneratorOrganization();
    $waste = Waste::factory()->create(['organization_id' => $generator->id]);
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $actor = srActor(['service_requests.create', 'service_requests.update'], $generator->id);

    $this->actingAs($actor)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'items' => [['waste_id' => $waste->id]],
    ])->assertCreated();

    $serviceRequest = WasteServiceRequest::query()->where('organization_id', $generator->id)->firstOrFail();

    $this->actingAs($actor)->postJson("/api/admin/service-requests/{$serviceRequest->id}/submit")
        ->assertUnprocessable()
        ->assertJsonValidationErrors([
            'items.0.waste_treatment_approval_id',
            'items.0.estimated_quantity',
            'items.0.measurement_unit_id',
        ]);
});

test('submit con campos completos transiciona DIRECTO a UNDER_REVIEW (SUBMITTED->UNDER_REVIEW es automática)', function () {
    $generator = srGeneratorOrganization();
    $gestor = srGestorOrganization();
    [$waste, $approval] = srViableItemFixture($generator, $gestor);
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $actor = srActor(['service_requests.create', 'service_requests.update'], $generator->id);

    $this->actingAs($actor)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertCreated();

    $serviceRequest = WasteServiceRequest::query()->where('organization_id', $generator->id)->firstOrFail();

    $this->actingAs($actor)->postJson("/api/admin/service-requests/{$serviceRequest->id}/submit")
        ->assertOk()
        ->assertJsonPath('service_request.service_status.code', 'UNDER_REVIEW');
});

// ---- approveItem()/rejectItem(): SOLO el Gestor dueño de ESE ítem ----

function srSubmittedRequestWithTwoGestores(Organization $generator, Organization $gestorA, Organization $gestorB): WasteServiceRequest
{
    [$wasteA, $approvalA] = srViableItemFixture($generator, $gestorA);
    [$wasteB, $approvalB] = srViableItemFixture($generator, $gestorB);
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $actor = srActor(['service_requests.create', 'service_requests.update'], $generator->id);

    $response = test()->actingAs($actor)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'items' => [srItemPayload($wasteA, $approvalA), srItemPayload($wasteB, $approvalB)],
    ])->assertCreated();

    $serviceRequest = WasteServiceRequest::query()->findOrFail($response->json('service_request.id'));

    test()->actingAs($actor)->postJson("/api/admin/service-requests/{$serviceRequest->id}/submit")
        ->assertOk()->assertJsonPath('service_request.service_status.code', 'UNDER_REVIEW');

    return $serviceRequest->fresh();
}

test('approveItem SOLO lo puede ejecutar el Gestor dueño de ese ítem (rechazo cross-Gestor con 403)', function () {
    $generator = srGeneratorOrganization();
    $gestorA = srGestorOrganization();
    $gestorB = srGestorOrganization();

    $serviceRequest = srSubmittedRequestWithTwoGestores($generator, $gestorA, $gestorB);
    $itemA = $serviceRequest->items()->first();

    $foreignActor = srActor(['service_requests.evaluate'], $gestorB->id);
    $this->actingAs($foreignActor)->postJson("/api/admin/service-requests/items/{$itemA->id}/approve")
        ->assertForbidden();

    $ownActor = srActor(['service_requests.evaluate'], $gestorA->id);
    $this->actingAs($ownActor)->postJson("/api/admin/service-requests/items/{$itemA->id}/approve")
        ->assertOk()
        ->assertJsonPath('item.item_status.code', 'ACCEPTED');
});

test('rejectItem exige notes (motivo de rechazo)', function () {
    $generator = srGeneratorOrganization();
    $gestorA = srGestorOrganization();
    $gestorB = srGestorOrganization();

    $serviceRequest = srSubmittedRequestWithTwoGestores($generator, $gestorA, $gestorB);
    $itemA = $serviceRequest->items()->first();

    $actor = srActor(['service_requests.evaluate'], $gestorA->id);

    $this->actingAs($actor)->postJson("/api/admin/service-requests/items/{$itemA->id}/reject")
        ->assertUnprocessable()->assertJsonValidationErrors('notes');

    $this->actingAs($actor)->postJson("/api/admin/service-requests/items/{$itemA->id}/reject", [
        'notes' => 'No cumple con la caracterización requerida.',
    ])->assertOk()->assertJsonPath('item.item_status.code', 'REJECTED');
});

test('recálculo de cabecera: 2 ítems de 2 Gestores distintos, AMBOS aprueban -> cabecera APPROVED', function () {
    $generator = srGeneratorOrganization();
    $gestorA = srGestorOrganization();
    $gestorB = srGestorOrganization();

    $serviceRequest = srSubmittedRequestWithTwoGestores($generator, $gestorA, $gestorB);
    $items = $serviceRequest->items()->get();

    $actorA = srActor(['service_requests.evaluate'], $gestorA->id);
    $actorB = srActor(['service_requests.evaluate'], $gestorB->id);

    $this->actingAs($actorA)->postJson("/api/admin/service-requests/items/{$items[0]->id}/approve")->assertOk();

    // Con un solo ítem aprobado (el otro aún PENDING), la cabecera NO se
    // mueve todavía (D-S01: espera a que TODOS los ítems tengan aprobación).
    expect($serviceRequest->fresh()->serviceStatus->code)->toBe('UNDER_REVIEW');

    $this->actingAs($actorB)->postJson("/api/admin/service-requests/items/{$items[1]->id}/approve")->assertOk();

    expect($serviceRequest->fresh()->serviceStatus->code)->toBe('APPROVED');
});

test('recálculo de cabecera: un Gestor aprueba, el OTRO rechaza -> cabecera REJECTED de inmediato', function () {
    $generator = srGeneratorOrganization();
    $gestorA = srGestorOrganization();
    $gestorB = srGestorOrganization();

    $serviceRequest = srSubmittedRequestWithTwoGestores($generator, $gestorA, $gestorB);
    $items = $serviceRequest->items()->get();

    $actorA = srActor(['service_requests.evaluate'], $gestorA->id);
    $actorB = srActor(['service_requests.evaluate'], $gestorB->id);

    $this->actingAs($actorA)->postJson("/api/admin/service-requests/items/{$items[0]->id}/approve")->assertOk();
    $this->actingAs($actorB)->postJson("/api/admin/service-requests/items/{$items[1]->id}/reject", [
        'notes' => 'Excede la capacidad autorizada.',
    ])->assertOk();

    expect($serviceRequest->fresh()->serviceStatus->code)->toBe('REJECTED');
});

// ---- cancel(): motivo obligatorio ----

test('cancel exige cancellation_reason_id y transiciona a CANCELLED', function () {
    $generator = srGeneratorOrganization();
    $gestor = srGestorOrganization();
    [$waste, $approval] = srViableItemFixture($generator, $gestor);
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $actor = srActor(['service_requests.create', 'service_requests.cancel'], $generator->id);

    $this->actingAs($actor)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertCreated();

    $serviceRequest = WasteServiceRequest::query()->where('organization_id', $generator->id)->firstOrFail();

    $this->actingAs($actor)->postJson("/api/admin/service-requests/{$serviceRequest->id}/cancel")
        ->assertUnprocessable()->assertJsonValidationErrors('cancellation_reason_id');

    $reason = CancellationReason::query()->where('code', 'OTHER')->firstOrFail();

    $this->actingAs($actor)->postJson("/api/admin/service-requests/{$serviceRequest->id}/cancel", [
        'cancellation_reason_id' => $reason->id,
        'cancellation_details' => 'El cliente desistió del servicio.',
    ])->assertOk()->assertJsonPath('service_request.service_status.code', 'CANCELLED');

    expect($serviceRequest->fresh()->cancelled_by)->toBe($actor->id);
});

// ---- index(): visibilidad NO simétrica ----

test('index: el Generador ve SUS solicitudes; un Gestor con >=1 ítem asignado también la ve; un Gestor ajeno NO', function () {
    $generator = srGeneratorOrganization();
    $gestorA = srGestorOrganization();
    $gestorB = srGestorOrganization();

    [$waste, $approval] = srViableItemFixture($generator, $gestorA);
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $creator = srActor(['service_requests.create', 'service_requests.read'], $generator->id);

    $response = $this->actingAs($creator)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertCreated();

    $serviceRequestId = $response->json('service_request.id');

    $generatorView = $this->actingAs($creator)->getJson('/api/admin/service-requests')->assertOk();
    expect(collect($generatorView->json('data'))->pluck('id'))->toContain($serviceRequestId);

    $gestorAActor = srActor(['service_requests.read'], $gestorA->id);
    $gestorAView = $this->actingAs($gestorAActor)->getJson('/api/admin/service-requests')->assertOk();
    expect(collect($gestorAView->json('data'))->pluck('id'))->toContain($serviceRequestId);

    $gestorBActor = srActor(['service_requests.read'], $gestorB->id);
    $gestorBView = $this->actingAs($gestorBActor)->getJson('/api/admin/service-requests')->assertOk();
    expect(collect($gestorBView->json('data'))->pluck('id'))->not->toContain($serviceRequestId);
});

test('show: un Gestor SIN ítems asignados en la solicitud recibe 403 (IDOR)', function () {
    $generator = srGeneratorOrganization();
    $gestorA = srGestorOrganization();
    $gestorB = srGestorOrganization();

    [$waste, $approval] = srViableItemFixture($generator, $gestorA);
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $creator = srActor(['service_requests.create'], $generator->id);

    $response = $this->actingAs($creator)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertCreated();

    $serviceRequestId = $response->json('service_request.id');

    $unrelatedActor = srActor(['service_requests.read'], $gestorB->id);
    $this->actingAs($unrelatedActor)->getJson("/api/admin/service-requests/{$serviceRequestId}")->assertForbidden();
});

test('platform staff ve TODAS las solicitudes y puede filtrar por organization_id', function () {
    $generatorA = srGeneratorOrganization();
    $generatorB = srGeneratorOrganization();
    $gestor = srGestorOrganization();

    [$wasteA, $approvalA] = srViableItemFixture($generatorA, $gestor);
    [$wasteB, $approvalB] = srViableItemFixture($generatorB, $gestor);

    $branchA = Branch::factory()->create(['organization_id' => $generatorA->id]);
    $branchB = Branch::factory()->create(['organization_id' => $generatorB->id]);

    $creatorA = srActor(['service_requests.create'], $generatorA->id);
    $creatorB = srActor(['service_requests.create'], $generatorB->id);

    $responseA = $this->actingAs($creatorA)->postJson('/api/admin/service-requests', [
        'branch_id' => $branchA->id,
        'items' => [srItemPayload($wasteA, $approvalA)],
    ])->assertCreated();

    $this->actingAs($creatorB)->postJson('/api/admin/service-requests', [
        'branch_id' => $branchB->id,
        'items' => [srItemPayload($wasteB, $approvalB)],
    ])->assertCreated();

    $platformActor = srPlatformStaffActor(['service_requests.read']);

    $allView = $this->actingAs($platformActor)->getJson('/api/admin/service-requests')->assertOk();
    expect($allView->json('total'))->toBe(2);

    $filteredView = $this->actingAs($platformActor)
        ->getJson("/api/admin/service-requests?organization_id={$generatorA->id}")
        ->assertOk();

    $ids = collect($filteredView->json('data'))->pluck('id');
    expect($ids)->toContain($responseA->json('service_request.id'))->toHaveCount(1);
});

// ---- Revisión de seguridad 2026-07-19: WorkflowLog de transiciones de cabecera ----

test('submit() escribe un WorkflowLog para DRAFT->SUBMITTED y otro para la automática SUBMITTED->UNDER_REVIEW', function () {
    $generator = srGeneratorOrganization();
    $gestor = srGestorOrganization();
    [$waste, $approval] = srViableItemFixture($generator, $gestor);
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $actor = srActor(['service_requests.create', 'service_requests.update'], $generator->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertCreated();

    $serviceRequest = WasteServiceRequest::query()->findOrFail($response->json('service_request.id'));

    $this->actingAs($actor)->postJson("/api/admin/service-requests/{$serviceRequest->id}/submit")->assertOk();

    $logs = WorkflowLog::query()
        ->where('process_type', 'SERVICE_REQUEST')
        ->where('process_id', $serviceRequest->id)
        ->orderBy('id')
        ->get();

    expect($logs)->toHaveCount(2);

    expect($logs[0]->previous_status)->toBe('DRAFT')
        ->and($logs[0]->new_status)->toBe('SUBMITTED')
        ->and($logs[0]->user_id)->toBe($actor->id)
        ->and($logs[0]->tenant_organization_id)->toBe($generator->id)
        ->and($logs[0]->source)->toBe('api');

    expect($logs[1]->previous_status)->toBe('SUBMITTED')
        ->and($logs[1]->new_status)->toBe('UNDER_REVIEW')
        ->and($logs[1]->tenant_organization_id)->toBe($generator->id);
});

test('cancel() escribe un WorkflowLog de la transición hacia CANCELLED', function () {
    $generator = srGeneratorOrganization();
    $gestor = srGestorOrganization();
    [$waste, $approval] = srViableItemFixture($generator, $gestor);
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $actor = srActor(['service_requests.create', 'service_requests.cancel'], $generator->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertCreated();

    $serviceRequest = WasteServiceRequest::query()->findOrFail($response->json('service_request.id'));
    $reason = CancellationReason::query()->where('code', 'OTHER')->firstOrFail();

    $this->actingAs($actor)->postJson("/api/admin/service-requests/{$serviceRequest->id}/cancel", [
        'cancellation_reason_id' => $reason->id,
        'cancellation_details' => 'El cliente desistió del servicio.',
    ])->assertOk();

    $log = WorkflowLog::query()
        ->where('process_type', 'SERVICE_REQUEST')
        ->where('process_id', $serviceRequest->id)
        ->where('new_status', 'CANCELLED')
        ->first();

    expect($log)->not->toBeNull()
        ->and($log->previous_status)->toBe('DRAFT')
        ->and($log->user_id)->toBe($actor->id)
        ->and($log->tenant_organization_id)->toBe($generator->id);
});

test('la aprobación de ítems que dispara el recálculo automático de cabecera escribe su propio WorkflowLog', function () {
    $generator = srGeneratorOrganization();
    $gestorA = srGestorOrganization();
    $gestorB = srGestorOrganization();

    $serviceRequest = srSubmittedRequestWithTwoGestores($generator, $gestorA, $gestorB);
    $items = $serviceRequest->items()->get();

    $actorA = srActor(['service_requests.evaluate'], $gestorA->id);
    $actorB = srActor(['service_requests.evaluate'], $gestorB->id);

    $this->actingAs($actorA)->postJson("/api/admin/service-requests/items/{$items[0]->id}/approve")->assertOk();
    $this->actingAs($actorB)->postJson("/api/admin/service-requests/items/{$items[1]->id}/approve")->assertOk();

    $log = WorkflowLog::query()
        ->where('process_type', 'SERVICE_REQUEST')
        ->where('process_id', $serviceRequest->id)
        ->where('new_status', 'APPROVED')
        ->first();

    expect($log)->not->toBeNull()
        ->and($log->previous_status)->toBe('UNDER_REVIEW')
        ->and($log->tenant_organization_id)->toBe($generator->id);
});

test('el rechazo de un ítem que dispara REJECTED de cabecera escribe su propio WorkflowLog', function () {
    $generator = srGeneratorOrganization();
    $gestorA = srGestorOrganization();
    $gestorB = srGestorOrganization();

    $serviceRequest = srSubmittedRequestWithTwoGestores($generator, $gestorA, $gestorB);
    $items = $serviceRequest->items()->get();

    $actorA = srActor(['service_requests.evaluate'], $gestorA->id);
    $actorB = srActor(['service_requests.evaluate'], $gestorB->id);

    $this->actingAs($actorA)->postJson("/api/admin/service-requests/items/{$items[0]->id}/approve")->assertOk();
    $this->actingAs($actorB)->postJson("/api/admin/service-requests/items/{$items[1]->id}/reject", [
        'notes' => 'Excede la capacidad autorizada.',
    ])->assertOk();

    $log = WorkflowLog::query()
        ->where('process_type', 'SERVICE_REQUEST')
        ->where('process_id', $serviceRequest->id)
        ->where('new_status', 'REJECTED')
        ->first();

    expect($log)->not->toBeNull()
        ->and($log->previous_status)->toBe('UNDER_REVIEW')
        ->and($log->tenant_organization_id)->toBe($generator->id);
});

// ---- Revisión de seguridad 2026-07-19: restricción cross-Gestor en show() ----

test('show(): un Gestor con ítems propios ve su detalle completo pero NO el de ítems de otros Gestores (solo sabe que existen)', function () {
    $generator = srGeneratorOrganization();
    $gestorA = srGestorOrganization();
    $gestorB = srGestorOrganization();

    [$wasteOwn, $approvalOwn] = srViableItemFixture($generator, $gestorA);
    [$wasteOther1, $approvalOther1] = srViableItemFixture($generator, $gestorB);
    [$wasteOther2, $approvalOther2] = srViableItemFixture($generator, $gestorB);

    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $creator = srActor(['service_requests.create'], $generator->id);

    $response = $this->actingAs($creator)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'items' => [
            srItemPayload($wasteOwn, $approvalOwn),
            srItemPayload($wasteOther1, $approvalOther1),
            srItemPayload($wasteOther2, $approvalOther2),
        ],
    ])->assertCreated();

    $serviceRequestId = $response->json('service_request.id');

    $gestorAActor = srActor(['service_requests.read'], $gestorA->id);

    $show = $this->actingAs($gestorAActor)
        ->getJson("/api/admin/service-requests/{$serviceRequestId}")
        ->assertOk();

    $items = collect($show->json('service_request.items'));

    expect($items)->toHaveCount(3);

    $ownItem = $items->firstWhere('waste_id', $wasteOwn->id);
    expect($ownItem)->not->toBeNull()
        ->and($ownItem['waste_treatment_approval_id'])->toBe($approvalOwn->id)
        ->and(data_get($ownItem, 'waste_treatment_approval.organization.legal_name'))->toBe($gestorA->legal_name);

    $foreignItems = $items->reject(fn ($item) => ($item['id'] ?? null) === $ownItem['id']);

    foreach ($foreignItems as $foreignItem) {
        expect($foreignItem)->not->toHaveKey('waste_id')
            ->and($foreignItem)->not->toHaveKey('waste_treatment_approval_id')
            ->and($foreignItem)->not->toHaveKey('waste_treatment_approval')
            ->and($foreignItem)->not->toHaveKey('estimated_quantity')
            ->and($foreignItem)->not->toHaveKey('treatment_snapshot');
    }

    expect($show->json('service_request.other_items_count'))->toBe(2);
});

test('show(): el Generador dueño y platform staff siguen viendo el detalle COMPLETO de TODOS los ítems', function () {
    $generator = srGeneratorOrganization();
    $gestorA = srGestorOrganization();
    $gestorB = srGestorOrganization();

    [$wasteA, $approvalA] = srViableItemFixture($generator, $gestorA);
    [$wasteB, $approvalB] = srViableItemFixture($generator, $gestorB);

    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $creator = srActor(['service_requests.create', 'service_requests.read'], $generator->id);

    $response = $this->actingAs($creator)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'items' => [srItemPayload($wasteA, $approvalA), srItemPayload($wasteB, $approvalB)],
    ])->assertCreated();

    $serviceRequestId = $response->json('service_request.id');

    $generatorShow = $this->actingAs($creator)->getJson("/api/admin/service-requests/{$serviceRequestId}")->assertOk();
    expect(collect($generatorShow->json('service_request.items'))->pluck('waste_id'))
        ->toContain($wasteA->id, $wasteB->id);
    expect($generatorShow->json('service_request.other_items_count'))->toBeNull();

    $platformActor = srPlatformStaffActor(['service_requests.read']);
    $platformShow = $this->actingAs($platformActor)->getJson("/api/admin/service-requests/{$serviceRequestId}")->assertOk();
    expect(collect($platformShow->json('service_request.items'))->pluck('waste_id'))
        ->toContain($wasteA->id, $wasteB->id);
});

// ---- Revisión de seguridad 2026-07-19: arreglos baratos ----

test('store rechaza más de 100 ítems', function () {
    $generator = srGeneratorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $actor = srActor(['service_requests.create'], $generator->id);
    $measurementUnitId = MeasurementUnit::factory()->create()->id;
    $waste = Waste::factory()->create(['organization_id' => $generator->id]);

    $items = array_fill(0, 101, ['waste_id' => $waste->id, 'estimated_quantity' => 50, 'measurement_unit_id' => $measurementUnitId]);

    $this->actingAs($actor)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'items' => $items,
    ])->assertUnprocessable()->assertJsonValidationErrors('items');
});

test('store rechaza una aprobación con is_active=false aunque ambos ejes estén APPROVED', function () {
    $generator = srGeneratorOrganization();
    $gestor = srGestorOrganization();
    $waste = Waste::factory()->create(['organization_id' => $generator->id]);
    $approval = WasteTreatmentApproval::factory()->viable()->create([
        'organization_id' => $gestor->id,
        'waste_id' => $waste->id,
        'is_active' => false,
    ]);

    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $actor = srActor(['service_requests.create'], $generator->id);

    $this->actingAs($actor)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertUnprocessable()->assertJsonValidationErrors('items.0.waste_treatment_approval_id');
});

test('approveItem/rejectItem registran organization_id en el metadata del SecurityLog', function () {
    $generator = srGeneratorOrganization();
    $gestorA = srGestorOrganization();
    $gestorB = srGestorOrganization();

    $serviceRequest = srSubmittedRequestWithTwoGestores($generator, $gestorA, $gestorB);
    $items = $serviceRequest->items()->get();

    $actorA = srActor(['service_requests.evaluate'], $gestorA->id);
    $actorB = srActor(['service_requests.evaluate'], $gestorB->id);

    $this->actingAs($actorA)->postJson("/api/admin/service-requests/items/{$items[0]->id}/approve")->assertOk();
    $this->actingAs($actorB)->postJson("/api/admin/service-requests/items/{$items[1]->id}/reject", [
        'notes' => 'Excede la capacidad autorizada.',
    ])->assertOk();

    $approvedLog = SecurityLog::query()->where('event_type', 'SERVICE_REQUEST_ITEM_APPROVED')->firstOrFail();
    $rejectedLog = SecurityLog::query()->where('event_type', 'SERVICE_REQUEST_ITEM_REJECTED')->firstOrFail();

    expect($approvedLog->metadata['organization_id'])->toBe($gestorA->id)
        ->and($rejectedLog->metadata['organization_id'])->toBe($gestorB->id);
});
