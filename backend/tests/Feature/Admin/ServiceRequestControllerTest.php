<?php

use App\Models\Branch;
use App\Models\BusinessRole;
use App\Models\CancellationReason;
use App\Models\CarteraStatus;
use App\Models\GeneratorGestorRelationship;
use App\Models\GeneratorSubgestorRelationship;
use App\Models\MeasurementUnit;
use App\Notifications\ServiceRequestDecidedNotification;
use App\Notifications\ServiceRequestSubmittedNotification;
use App\Models\Organization;
use App\Models\OrganizationBusinessRole;
use App\Models\OrganizationCarteraStatus;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\SecurityLog;
use App\Models\ServiceStatus;
use App\Models\User;
use App\Models\UserRole;
use App\Models\Waste;
use App\Models\WasteServiceRequest;
use App\Models\WasteServiceRequestItem;
use App\Models\WasteTreatmentApproval;
use App\Models\WorkflowLog;
use Illuminate\Support\Facades\Notification;
use Database\Seeders\BusinessRoleSeeder;
use Database\Seeders\CancellationReasonSeeder;
use Database\Seeders\CarteraStatusSeeder;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\PlatformOrganizationSeeder;
use Database\Seeders\RespelStatusSeeder;
use Database\Seeders\RolePermissionSeeder;
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
 *
 * Crea además la relación comercial Generador->Gestor: desde el destinatario
 * único (2026-08-18) `store()` exige que la contraparte elegida tenga vínculo
 * ACTIVO con el Generador, y sin él ningún test podría crear una solicitud.
 */
function srViableItemFixture(Organization $generator, Organization $gestor): array
{
    $waste = Waste::factory()->create(['status' => Waste::STATUS_APPROVED, 'organization_id' => $generator->id]);
    $approval = WasteTreatmentApproval::factory()->viable()->create([
        'organization_id' => $gestor->id,
        'waste_id' => $waste->id,
    ]);

    srLinkGeneratorTo($generator, $gestor);

    return [$waste, $approval];
}

/**
 * Relación comercial ACTIVA Generador->Gestor, idempotente (varios fixtures
 * pueden pedir el mismo par dentro de un test).
 */
function srLinkGeneratorTo(Organization $generator, Organization $gestor): void
{
    GeneratorGestorRelationship::query()->firstOrCreate([
        'generator_organization_id' => $generator->id,
        'gestor_organization_id' => $gestor->id,
    ]);
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
        'counterparty_organization_id' => $gestor->id,
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
    // Destinatario válido: sin él saltaría primero la validación de
    // contraparte y este test dejaría de ejercer el IDOR que le da nombre.
    $gestor = srGestorOrganization();
    srLinkGeneratorTo($generator, $gestor);

    $otherOrganization = Organization::factory()->create();
    $waste = Waste::factory()->create(['status' => Waste::STATUS_APPROVED, 'organization_id' => $otherOrganization->id]);
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);

    $actor = srActor(['service_requests.create'], $generator->id);

    $this->actingAs($actor)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'counterparty_organization_id' => $gestor->id,
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
        'counterparty_organization_id' => $gestor->id,
        'items' => [srItemPayload($waste, $foreignApproval)],
    ])->assertUnprocessable()->assertJsonValidationErrors('items.0.waste_treatment_approval_id');
});

// El eje COMERCIAL dejó de bloquear (2026-08-14): se resuelve fuera de la
// plataforma y no debe frenar el flujo. Este test antes exigía AMBOS ejes;
// ahora fija lo contrario -- con el eje técnico aprobado basta.
test('store ACEPTA una aprobación con el eje comercial sin resolver', function () {
    $generator = srGeneratorOrganization();
    $gestor = srGestorOrganization();
    srLinkGeneratorTo($generator, $gestor);
    $waste = Waste::factory()->create(['status' => Waste::STATUS_APPROVED, 'organization_id' => $generator->id]);
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
        'counterparty_organization_id' => $gestor->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertCreated();
});

test('store rechaza una aprobación con el eje TÉCNICO sin aprobar', function () {
    $generator = srGeneratorOrganization();
    $gestor = srGestorOrganization();
    srLinkGeneratorTo($generator, $gestor);
    $waste = Waste::factory()->create(['status' => Waste::STATUS_APPROVED, 'organization_id' => $generator->id]);
    $approval = WasteTreatmentApproval::factory()->create([
        'organization_id' => $gestor->id,
        'waste_id' => $waste->id,
        'technical_status' => 'PENDING',
    ]);

    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $actor = srActor(['service_requests.create'], $generator->id);

    $this->actingAs($actor)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'counterparty_organization_id' => $gestor->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertUnprocessable()->assertJsonValidationErrors('items.0.waste_treatment_approval_id');
});

// APROBADO es lo ÚNICO que habilita una Solicitud de Servicio: un residuo
// Clasificado, aunque ya tenga tratamiento asignado, todavía no sirve.
test('store rechaza un residuo que aún NO está Aprobado', function () {
    $generator = srGeneratorOrganization();
    $gestor = srGestorOrganization();
    srLinkGeneratorTo($generator, $gestor);
    $waste = Waste::factory()->create(['status' => Waste::STATUS_CLASSIFIED, 'organization_id' => $generator->id]);
    $approval = WasteTreatmentApproval::factory()->create([
        'organization_id' => $gestor->id,
        'waste_id' => $waste->id,
        'technical_status' => 'APPROVED',
    ]);

    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $actor = srActor(['service_requests.create'], $generator->id);

    $this->actingAs($actor)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'counterparty_organization_id' => $gestor->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertUnprocessable()->assertJsonValidationErrors('items.0.waste_id');
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
        'counterparty_organization_id' => $gestor->id,
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
        'counterparty_organization_id' => $gestor->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertCreated();
});

test('store rechaza si la organización actora NO tiene la capacidad can_generate_waste', function () {
    $nonGenerator = Organization::factory()->create();
    // El 403 lo produce la Policy, antes de cualquier validación de cuerpo:
    // este destinatario solo existe para que el payload esté completo.
    $gestor = srGestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $nonGenerator->id]);
    $waste = Waste::factory()->create(['status' => Waste::STATUS_APPROVED, 'organization_id' => $nonGenerator->id]);

    $actor = srActor(['service_requests.create'], $nonGenerator->id);

    $this->actingAs($actor)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'counterparty_organization_id' => $gestor->id,
        'items' => [srItemPayload($waste)],
    ])->assertForbidden();
});

// ---- submit(): validación de campos completos + transición automática ----

// PREMISA CAMBIADA (2026-08-18). Este test creaba una solicitud con un ítem
// SIN aprobación y comprobaba que `submit()` la frenaba después. Eso ya no se
// puede montar: con destinatario único, la evaluación es lo que DICE a quién se
// atribuye el residuo, así que `store()` la exige de entrada.
//
// De paso cierra un callejón sin salida real: el ítem sin aprobación se
// aceptaba al crear, `submit()` lo rechazaba, y como `update()` no sincroniza
// ítems, esa solicitud no podía enviarse NUNCA. La validación de `submit()` se
// conserva como guarda de las solicitudes anteriores al cambio.
test('store exige la evaluación de tratamiento en cada ítem (antes se aceptaba y la solicitud quedaba imposible de enviar)', function () {
    $generator = srGeneratorOrganization();
    $gestor = srGestorOrganization();
    srLinkGeneratorTo($generator, $gestor);
    $waste = Waste::factory()->create(['status' => Waste::STATUS_APPROVED, 'organization_id' => $generator->id]);
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $actor = srActor(['service_requests.create', 'service_requests.update'], $generator->id);

    $this->actingAs($actor)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'counterparty_organization_id' => $gestor->id,
        'items' => [['waste_id' => $waste->id]],
    ])->assertUnprocessable()->assertJsonValidationErrors('items.0.waste_treatment_approval_id');

    expect(WasteServiceRequest::query()->where('organization_id', $generator->id)->exists())->toBeFalse();
});

test('submit con campos completos transiciona DIRECTO a UNDER_REVIEW (SUBMITTED->UNDER_REVIEW es automática)', function () {
    $generator = srGeneratorOrganization();
    $gestor = srGestorOrganization();
    [$waste, $approval] = srViableItemFixture($generator, $gestor);
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $actor = srActor(['service_requests.create', 'service_requests.update'], $generator->id);

    $this->actingAs($actor)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'counterparty_organization_id' => $gestor->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertCreated();

    $serviceRequest = WasteServiceRequest::query()->where('organization_id', $generator->id)->firstOrFail();

    $this->actingAs($actor)->postJson("/api/admin/service-requests/{$serviceRequest->id}/submit")
        ->assertOk()
        ->assertJsonPath('service_request.service_status.code', 'UNDER_REVIEW');
});

// ---- approveItem()/rejectItem(): SOLO el Gestor dueño de ESE ítem ----

/**
 * Solicitud en UNDER_REVIEW con ítems de DOS Gestores distintos.
 *
 * Se monta directamente en base de datos (2026-08-18): por API ya no es
 * construible, porque el destinatario único prohíbe mezclar Gestores. Sigue
 * haciendo falta para probar D-S25 -- que solo el Gestor dueño de un ítem puede
 * evaluarlo -- sobre las solicitudes ANTERIORES al cambio, que sí podían
 * mezclarlos y son exactamente donde esa regla protege algo.
 */
function srSubmittedRequestWithTwoGestores(Organization $generator, Organization $gestorA, Organization $gestorB): WasteServiceRequest
{
    [$wasteA, $approvalA] = srViableItemFixture($generator, $gestorA);
    [$wasteB, $approvalB] = srViableItemFixture($generator, $gestorB);
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);

    $serviceRequest = WasteServiceRequest::factory()->create([
        'organization_id' => $generator->id,
        'branch_id' => $branch->id,
        'counterparty_organization_id' => null,
        'gestor_organization_id' => null,
    ]);

    // `service_status_id` no es fillable (ver docblock del modelo).
    $serviceRequest->forceFill([
        'service_status_id' => ServiceStatus::query()->where('code', 'UNDER_REVIEW')->value('id'),
    ])->save();

    foreach ([[$wasteA, $approvalA], [$wasteB, $approvalB]] as $index => [$waste, $approval]) {
        WasteServiceRequestItem::factory()->create([
            'service_request_id' => $serviceRequest->id,
            'item_sequence' => $index + 1,
            'waste_id' => $waste->id,
            'waste_treatment_approval_id' => $approval->id,
        ]);
    }

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
        'counterparty_organization_id' => $gestor->id,
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
        'counterparty_organization_id' => $gestorA->id,
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
        'counterparty_organization_id' => $gestorA->id,
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
        'counterparty_organization_id' => $gestor->id,
        'items' => [srItemPayload($wasteA, $approvalA)],
    ])->assertCreated();

    $this->actingAs($creatorB)->postJson('/api/admin/service-requests', [
        'branch_id' => $branchB->id,
        'counterparty_organization_id' => $gestor->id,
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
        'counterparty_organization_id' => $gestor->id,
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
        'counterparty_organization_id' => $gestor->id,
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

// PREMISA CAMBIADA (2026-08-18): una solicitud NUEVA ya no puede mezclar
// Gestores, así que el escenario que este test montaba por API es ahora
// imposible de crear. La regla lo sustituye: en vez de ocultar los ítems del
// competidor, se impide que compartan documento.
test('store rechaza mezclar en una misma solicitud residuos que trata más de un Gestor', function () {
    $generator = srGeneratorOrganization();
    $gestorA = srGestorOrganization();
    $gestorB = srGestorOrganization();

    [$wasteA, $approvalA] = srViableItemFixture($generator, $gestorA);
    [$wasteB, $approvalB] = srViableItemFixture($generator, $gestorB);

    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $creator = srActor(['service_requests.create'], $generator->id);

    $this->actingAs($creator)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'counterparty_organization_id' => $gestorA->id,
        'items' => [srItemPayload($wasteA, $approvalA), srItemPayload($wasteB, $approvalB)],
    ])->assertUnprocessable()->assertJsonValidationErrors('items.1.waste_id');
});

// La vista reducida NO se retira: sigue protegiendo las solicitudes anteriores
// al destinatario único, que sí podían mezclar Gestores. Se monta directamente
// en base de datos porque por API ya no es construible (ver test de arriba).
test('show(): en una solicitud ANTERIOR al destinatario único, un Gestor sigue sin ver los ítems de otro', function () {
    $generator = srGeneratorOrganization();
    $gestorA = srGestorOrganization();
    $gestorB = srGestorOrganization();

    [$wasteOwn, $approvalOwn] = srViableItemFixture($generator, $gestorA);
    [$wasteOther, $approvalOther] = srViableItemFixture($generator, $gestorB);

    $branch = Branch::factory()->create(['organization_id' => $generator->id]);

    $serviceRequest = WasteServiceRequest::factory()->create([
        'organization_id' => $generator->id,
        'branch_id' => $branch->id,
        // Sin destinatario: exactamente la forma de las filas viejas.
        'counterparty_organization_id' => null,
        'gestor_organization_id' => null,
    ]);

    foreach ([[$wasteOwn, $approvalOwn], [$wasteOther, $approvalOther]] as $index => [$waste, $approval]) {
        WasteServiceRequestItem::factory()->create([
            'service_request_id' => $serviceRequest->id,
            'item_sequence' => $index + 1,
            'waste_id' => $waste->id,
            'waste_treatment_approval_id' => $approval->id,
        ]);
    }

    $gestorAActor = srActor(['service_requests.read'], $gestorA->id);

    $show = $this->actingAs($gestorAActor)
        ->getJson("/api/admin/service-requests/{$serviceRequest->id}")
        ->assertOk();

    $items = collect($show->json('service_request.items'));
    $ownItem = $items->firstWhere('waste_id', $wasteOwn->id);

    expect($items)->toHaveCount(2)
        ->and($ownItem)->not->toBeNull()
        ->and($ownItem['waste_treatment_approval_id'])->toBe($approvalOwn->id);

    $foreignItem = $items->firstWhere(fn ($item) => ($item['id'] ?? null) !== $ownItem['id']);

    expect($foreignItem)->not->toHaveKey('waste_id')
        ->and($foreignItem)->not->toHaveKey('waste_treatment_approval_id')
        ->and($foreignItem)->not->toHaveKey('estimated_quantity')
        ->and($show->json('service_request.other_items_count'))->toBe(1);
});

test('show(): el Generador dueño y platform staff siguen viendo el detalle COMPLETO de TODOS los ítems', function () {
    $generator = srGeneratorOrganization();
    // Los dos residuos van al MISMO Gestor: desde el destinatario único
    // (2026-08-18) una solicitud no puede mezclarlos.
    $gestorA = srGestorOrganization();

    [$wasteA, $approvalA] = srViableItemFixture($generator, $gestorA);
    [$wasteB, $approvalB] = srViableItemFixture($generator, $gestorA);

    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $creator = srActor(['service_requests.create', 'service_requests.read'], $generator->id);

    $response = $this->actingAs($creator)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'counterparty_organization_id' => $gestorA->id,
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
    $waste = Waste::factory()->create(['status' => Waste::STATUS_APPROVED, 'organization_id' => $generator->id]);

    // El tope de 100 lo aplica `$request->validate()`, antes de cualquier
    // comprobación de destinatario: este solo completa el payload.
    $gestor = srGestorOrganization();
    srLinkGeneratorTo($generator, $gestor);
    $items = array_fill(0, 101, ['waste_id' => $waste->id, 'estimated_quantity' => 50, 'measurement_unit_id' => $measurementUnitId]);

    $this->actingAs($actor)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'counterparty_organization_id' => $gestor->id,
        'items' => $items,
    ])->assertUnprocessable()->assertJsonValidationErrors('items');
});

test('store rechaza una aprobación con is_active=false aunque ambos ejes estén APPROVED', function () {
    $generator = srGeneratorOrganization();
    $gestor = srGestorOrganization();
    srLinkGeneratorTo($generator, $gestor);
    $waste = Waste::factory()->create(['status' => Waste::STATUS_APPROVED, 'organization_id' => $generator->id]);
    $approval = WasteTreatmentApproval::factory()->viable()->create([
        'organization_id' => $gestor->id,
        'waste_id' => $waste->id,
        'is_active' => false,
    ]);

    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $actor = srActor(['service_requests.create'], $generator->id);

    $this->actingAs($actor)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'counterparty_organization_id' => $gestor->id,
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

// ---------------------------------------------------------------------------
// Destinatario único (2026-08-18). `D-S01` permitía dirigir una solicitud a
// VARIOS Gestores a la vez; con varios no hay a quién notificar ni quién es
// dueño del siguiente paso, y se mezclaban en un documento residuos de Gestores
// que compiten entre sí.
//
// La atribución la decide `CommercialCounterpartyService::resolveForApproval()`:
// si hubo intermediario, gana el intermediario.
// ---------------------------------------------------------------------------

/** Subgestor con business_role real y capacidad de transporte. */
function srSubgestorOrganization(): Organization
{
    $organization = Organization::factory()->create();
    $subgestor = BusinessRole::query()->where('code', 'SUBGESTOR')->firstOrFail();

    OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id,
        'business_role_id' => $subgestor->id,
        'assigned_at' => now(),
        'is_active' => true,
    ]);

    return $organization->fresh();
}

test('vía DIRECTA: la contraparte y el Gestor son la misma organización', function () {
    $generator = srGeneratorOrganization();
    $gestor = srGestorOrganization();
    [$waste, $approval] = srViableItemFixture($generator, $gestor);
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $actor = srActor(['service_requests.create'], $generator->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'counterparty_organization_id' => $gestor->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertCreated();

    $response->assertJsonPath('service_request.counterparty_organization_id', $gestor->id)
        ->assertJsonPath('service_request.gestor_organization_id', $gestor->id);
});

// El caso que describió el usuario: el Generador solo tiene trato con el
// Subgestor, que registró la evaluación a nombre de un Gestor DE REFERENCIA.
test('vía DELEGADA: la contraparte es el Subgestor y el Gestor de referencia queda detrás', function () {
    $generator = srGeneratorOrganization();
    $subgestor = srSubgestorOrganization();
    $gestorExterno = srGestorOrganization();

    $waste = Waste::factory()->create(['status' => Waste::STATUS_APPROVED, 'organization_id' => $generator->id]);
    $approval = WasteTreatmentApproval::factory()->viable()->create([
        'organization_id' => $gestorExterno->id,
        'waste_id' => $waste->id,
        'delegated_by_organization_id' => $subgestor->id,
    ]);

    GeneratorSubgestorRelationship::query()->create([
        'generator_organization_id' => $generator->id,
        'subgestor_organization_id' => $subgestor->id,
    ]);

    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $actor = srActor(['service_requests.create'], $generator->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'counterparty_organization_id' => $subgestor->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertCreated();

    $response->assertJsonPath('service_request.counterparty_organization_id', $subgestor->id)
        ->assertJsonPath('service_request.gestor_organization_id', $gestorExterno->id);
});

// Reenviado y delegado comparten la misma lógica comercial: el Generador nunca
// tuvo trato con el Gestor final.
test('vía REENVIADA: la contraparte también es el Subgestor', function () {
    $generator = srGeneratorOrganization();
    $subgestor = srSubgestorOrganization();
    $gestor = srGestorOrganization();

    $waste = Waste::factory()->create(['status' => Waste::STATUS_APPROVED, 'organization_id' => $generator->id]);
    $approval = WasteTreatmentApproval::factory()->viable()->create([
        'organization_id' => $gestor->id,
        'waste_id' => $waste->id,
        'forwarded_by_organization_id' => $subgestor->id,
    ]);

    GeneratorSubgestorRelationship::query()->create([
        'generator_organization_id' => $generator->id,
        'subgestor_organization_id' => $subgestor->id,
    ]);

    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $actor = srActor(['service_requests.create'], $generator->id);

    $this->actingAs($actor)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'counterparty_organization_id' => $subgestor->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertCreated()
        ->assertJsonPath('service_request.counterparty_organization_id', $subgestor->id)
        ->assertJsonPath('service_request.gestor_organization_id', $gestor->id);
});

// Gana el intermediario aunque exista relación directa con el Gestor que
// evaluó: la relación comercial de ESE residuo pasó por el Subgestor.
test('un residuo evaluado vía Subgestor NO se le puede solicitar al Gestor directamente', function () {
    $generator = srGeneratorOrganization();
    $subgestor = srSubgestorOrganization();
    $gestor = srGestorOrganization();
    srLinkGeneratorTo($generator, $gestor);

    $waste = Waste::factory()->create(['status' => Waste::STATUS_APPROVED, 'organization_id' => $generator->id]);
    $approval = WasteTreatmentApproval::factory()->viable()->create([
        'organization_id' => $gestor->id,
        'waste_id' => $waste->id,
        'forwarded_by_organization_id' => $subgestor->id,
    ]);

    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $actor = srActor(['service_requests.create'], $generator->id);

    $this->actingAs($actor)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'counterparty_organization_id' => $gestor->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertUnprocessable()->assertJsonValidationErrors('items.0.waste_id');
});

test('no se puede elegir una contraparte sin relación comercial activa', function () {
    $generator = srGeneratorOrganization();
    $gestor = srGestorOrganization();
    [$waste, $approval] = srViableItemFixture($generator, $gestor);

    // Un tercero con el que no hay ningún vínculo.
    $ajeno = srGestorOrganization();

    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $actor = srActor(['service_requests.create'], $generator->id);

    $this->actingAs($actor)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'counterparty_organization_id' => $ajeno->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertUnprocessable()->assertJsonValidationErrors('counterparty_organization_id');
});

test('una relación REVOCADA ya no habilita como contraparte', function () {
    $generator = srGeneratorOrganization();
    $gestor = srGestorOrganization();
    [$waste, $approval] = srViableItemFixture($generator, $gestor);

    // `is_active` no es fillable en las relaciones comerciales: solo cambia por
    // la lógica de revocación del controller.
    GeneratorGestorRelationship::query()
        ->where('generator_organization_id', $generator->id)
        ->where('gestor_organization_id', $gestor->id)
        ->first()
        ->forceFill(['is_active' => false])->save();

    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $actor = srActor(['service_requests.create'], $generator->id);

    $this->actingAs($actor)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'counterparty_organization_id' => $gestor->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertUnprocessable()->assertJsonValidationErrors('counterparty_organization_id');
});

test('el destinatario queda registrado en la auditoría de creación', function () {
    $generator = srGeneratorOrganization();
    $gestor = srGestorOrganization();
    [$waste, $approval] = srViableItemFixture($generator, $gestor);
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $actor = srActor(['service_requests.create'], $generator->id);

    $this->actingAs($actor)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'counterparty_organization_id' => $gestor->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertCreated();

    $log = SecurityLog::query()->where('event_type', 'SERVICE_REQUEST_CREATED')->firstOrFail();
    expect($log->metadata['counterparty_organization_id'])->toBe($gestor->id)
        ->and($log->metadata['gestor_organization_id'])->toBe($gestor->id);
});

// Cambiar el destinatario de una solicitud ya creada invalidaría sus ítems, que
// están atados a las evaluaciones de ESA contraparte.
test('update NO acepta cambiar el destinatario', function () {
    $generator = srGeneratorOrganization();
    $gestor = srGestorOrganization();
    $otro = srGestorOrganization();
    srLinkGeneratorTo($generator, $otro);
    [$waste, $approval] = srViableItemFixture($generator, $gestor);
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $actor = srActor(['service_requests.create', 'service_requests.update'], $generator->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'counterparty_organization_id' => $gestor->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertCreated();

    $id = $response->json('service_request.id');

    $this->actingAs($actor)->putJson("/api/admin/service-requests/{$id}", [
        'counterparty_organization_id' => $otro->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('counterparty_organization_id');

    expect(WasteServiceRequest::query()->find($id)->counterparty_organization_id)->toBe($gestor->id);
});

// ---- Visibilidad por destinatario ----

test('el Subgestor destinatario ve la solicitud y su detalle COMPLETO', function () {
    $generator = srGeneratorOrganization();
    $subgestor = srSubgestorOrganization();
    $gestorExterno = srGestorOrganization();

    $waste = Waste::factory()->create(['status' => Waste::STATUS_APPROVED, 'organization_id' => $generator->id]);
    $approval = WasteTreatmentApproval::factory()->viable()->create([
        'organization_id' => $gestorExterno->id,
        'waste_id' => $waste->id,
        'delegated_by_organization_id' => $subgestor->id,
    ]);

    GeneratorSubgestorRelationship::query()->create([
        'generator_organization_id' => $generator->id,
        'subgestor_organization_id' => $subgestor->id,
    ]);

    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $creator = srActor(['service_requests.create'], $generator->id);

    $id = $this->actingAs($creator)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'counterparty_organization_id' => $subgestor->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertCreated()->json('service_request.id');

    // Antes esto era imposible: la visibilidad se derivaba del
    // `organization_id` de la evaluación, que aquí es el Gestor externo.
    $subgestorActor = srActor(['service_requests.read'], $subgestor->id);

    expect(collect($this->actingAs($subgestorActor)->getJson('/api/admin/service-requests')->assertOk()->json('data'))->pluck('id'))
        ->toContain($id);

    $show = $this->actingAs($subgestorActor)->getJson("/api/admin/service-requests/{$id}")->assertOk();
    expect($show->json('service_request.items.0.waste_id'))->toBe($waste->id)
        ->and($show->json('service_request.other_items_count'))->toBeNull();
});

// ---- counterparties(): alimenta el paso 1 del asistente ----

test('counterparties devuelve solo contrapartes con residuos listos', function () {
    $generator = srGeneratorOrganization();
    $conResiduos = srGestorOrganization();
    $sinResiduos = srGestorOrganization();

    srViableItemFixture($generator, $conResiduos);
    srLinkGeneratorTo($generator, $sinResiduos);

    $actor = srActor(['service_requests.read'], $generator->id);

    $counterparties = collect($this->actingAs($actor)
        ->getJson('/api/admin/service-requests/counterparties')
        ->assertOk()
        ->json('counterparties'));

    expect($counterparties->pluck('id'))->toContain($conResiduos->id)->not->toContain($sinResiduos->id)
        ->and($counterparties->firstWhere('id', $conResiduos->id)['ready_wastes_count'])->toBe(1)
        ->and($counterparties->firstWhere('id', $conResiduos->id)['role'])->toBe('GESTOR');
});

// Un residuo que no llegó a Aprobado no habilita a su contraparte: si no, el
// Generador elegiría un destinatario y encontraría el paso 2 vacío.
test('counterparties ignora los residuos que no están Aprobados', function () {
    $generator = srGeneratorOrganization();
    $gestor = srGestorOrganization();
    srLinkGeneratorTo($generator, $gestor);

    $waste = Waste::factory()->create(['status' => Waste::STATUS_CLASSIFIED, 'organization_id' => $generator->id]);
    WasteTreatmentApproval::factory()->viable()->create([
        'organization_id' => $gestor->id,
        'waste_id' => $waste->id,
    ]);

    $actor = srActor(['service_requests.read'], $generator->id);

    expect($this->actingAs($actor)->getJson('/api/admin/service-requests/counterparties')->assertOk()->json('counterparties'))
        ->toBe([]);
});

test('counterparties atribuye al Subgestor los residuos que él evaluó por delegación', function () {
    $generator = srGeneratorOrganization();
    $subgestor = srSubgestorOrganization();
    $gestorExterno = srGestorOrganization();

    $waste = Waste::factory()->create(['status' => Waste::STATUS_APPROVED, 'organization_id' => $generator->id]);
    WasteTreatmentApproval::factory()->viable()->create([
        'organization_id' => $gestorExterno->id,
        'waste_id' => $waste->id,
        'delegated_by_organization_id' => $subgestor->id,
    ]);

    GeneratorSubgestorRelationship::query()->create([
        'generator_organization_id' => $generator->id,
        'subgestor_organization_id' => $subgestor->id,
    ]);

    $actor = srActor(['service_requests.read'], $generator->id);

    $counterparties = collect($this->actingAs($actor)
        ->getJson('/api/admin/service-requests/counterparties')
        ->assertOk()
        ->json('counterparties'));

    // El Gestor externo NO aparece: no hay relación comercial con él.
    expect($counterparties->pluck('id'))->toContain($subgestor->id)->not->toContain($gestorExterno->id)
        ->and($counterparties->firstWhere('id', $subgestor->id)['role'])->toBe('SUBGESTOR');
});

// ---------------------------------------------------------------------------
// El destinatario EVALÚA, no solo mira (2026-08-19).
//
// Con el destinatario en la cabecera, un Subgestor ya veía su solicitud pero no
// podía resolverla: `isEvaluableBy()` comparaba contra el `organization_id` de
// la evaluación, que en la vía DELEGADA es el Gestor DE REFERENCIA -- el que no
// tiene usuarios aquí. La solicitud le llegaba y se quedaba en un limbo.
// ---------------------------------------------------------------------------

/**
 * Solicitud enviada a un SUBGESTOR, con el Gestor de referencia detrás.
 * Devuelve [$serviceRequest, $subgestor, $gestorExterno].
 */
function srDelegatedSubmittedRequest(): array
{
    $generator = srGeneratorOrganization();
    $subgestor = srSubgestorOrganization();
    $gestorExterno = srGestorOrganization();

    $waste = Waste::factory()->create(['status' => Waste::STATUS_APPROVED, 'organization_id' => $generator->id]);
    $approval = WasteTreatmentApproval::factory()->viable()->create([
        'organization_id' => $gestorExterno->id,
        'waste_id' => $waste->id,
        'delegated_by_organization_id' => $subgestor->id,
    ]);

    GeneratorSubgestorRelationship::query()->create([
        'generator_organization_id' => $generator->id,
        'subgestor_organization_id' => $subgestor->id,
    ]);

    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $actor = srActor(['service_requests.create', 'service_requests.update'], $generator->id);

    $id = test()->actingAs($actor)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'counterparty_organization_id' => $subgestor->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertCreated()->json('service_request.id');

    test()->actingAs($actor)->postJson("/api/admin/service-requests/{$id}/submit")
        ->assertOk()->assertJsonPath('service_request.service_status.code', 'UNDER_REVIEW');

    return [WasteServiceRequest::query()->findOrFail($id), $subgestor, $gestorExterno];
}

test('el SUBGESTOR destinatario puede aprobar los ítems de su solicitud', function () {
    [$serviceRequest, $subgestor] = srDelegatedSubmittedRequest();
    $item = $serviceRequest->items()->firstOrFail();

    $subgestorActor = srActor(['service_requests.evaluate'], $subgestor->id);

    $this->actingAs($subgestorActor)
        ->postJson("/api/admin/service-requests/items/{$item->id}/approve")
        ->assertOk();

    expect($item->fresh()->itemStatus->code)->toBe('ACCEPTED');
});

test('el SUBGESTOR destinatario también puede rechazar', function () {
    [$serviceRequest, $subgestor] = srDelegatedSubmittedRequest();
    $item = $serviceRequest->items()->firstOrFail();

    $subgestorActor = srActor(['service_requests.evaluate'], $subgestor->id);

    $this->actingAs($subgestorActor)
        ->postJson("/api/admin/service-requests/items/{$item->id}/reject", ['notes' => 'Sin cupo esta semana.'])
        ->assertOk();

    expect($item->fresh()->itemStatus->code)->toBe('REJECTED');
});

// "Se gestiona entre los dos": el Gestor que queda detrás conserva el acceso,
// no se lo quita el hecho de que la contraparte sea el Subgestor.
test('el GESTOR que queda detrás sigue pudiendo evaluar', function () {
    [$serviceRequest, , $gestorExterno] = srDelegatedSubmittedRequest();
    $item = $serviceRequest->items()->firstOrFail();

    $gestorActor = srActor(['service_requests.evaluate'], $gestorExterno->id);

    $this->actingAs($gestorActor)
        ->postJson("/api/admin/service-requests/items/{$item->id}/approve")
        ->assertOk();
});

// El acceso lo da SER el destinatario, no ser Subgestor.
test('un Subgestor AJENO a la solicitud sigue recibiendo 403', function () {
    [$serviceRequest] = srDelegatedSubmittedRequest();
    $item = $serviceRequest->items()->firstOrFail();

    $ajeno = srSubgestorOrganization();
    $ajenoActor = srActor(['service_requests.evaluate'], $ajeno->id);

    $this->actingAs($ajenoActor)
        ->postJson("/api/admin/service-requests/items/{$item->id}/approve")
        ->assertForbidden();
});

// D-S25 sigue protegiendo lo único que puede protegerse ya: las solicitudes
// anteriores al destinatario único, que sí mezclaban Gestores.
test('en una solicitud ANTERIOR al destinatario único, un Gestor sigue sin poder evaluar el ítem de otro', function () {
    $generator = srGeneratorOrganization();
    $gestorA = srGestorOrganization();
    $gestorB = srGestorOrganization();

    $serviceRequest = srSubmittedRequestWithTwoGestores($generator, $gestorA, $gestorB);
    $itemA = $serviceRequest->items()->orderBy('item_sequence')->first();

    $foreignActor = srActor(['service_requests.evaluate'], $gestorB->id);
    $this->actingAs($foreignActor)
        ->postJson("/api/admin/service-requests/items/{$itemA->id}/approve")
        ->assertForbidden();
});

// ---------------------------------------------------------------------------
// Notificaciones (2026-08-19). Hasta ahora el módulo no tenía ninguna: una
// solicitud enviada solo se descubría si alguien entraba a mirar. No se podía
// arreglar antes porque no había a quién avisar -- el destino se deducía de los
// tratamientos de cada ítem y podían ser varios Gestores.
// ---------------------------------------------------------------------------

test('al enviar, se avisa al DESTINATARIO y no al Generador', function () {
    Notification::fake();

    $generator = srGeneratorOrganization();
    $gestor = srGestorOrganization();
    [$waste, $approval] = srViableItemFixture($generator, $gestor);
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);

    // Quien recibe el aviso es quien puede evaluar, no cualquiera del Gestor.
    $evaluador = srActor(['service_requests.evaluate'], $gestor->id);
    $creador = srActor(['service_requests.create', 'service_requests.update'], $generator->id);

    $id = $this->actingAs($creador)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'counterparty_organization_id' => $gestor->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertCreated()->json('service_request.id');

    Notification::assertNothingSent();

    $this->actingAs($creador)->postJson("/api/admin/service-requests/{$id}/submit")->assertOk();

    Notification::assertSentTo($evaluador, ServiceRequestSubmittedNotification::class);
    Notification::assertNotSentTo($creador, ServiceRequestSubmittedNotification::class);
});

// Se avisa a la CONTRAPARTE, no al Gestor detrás: es con quien el Generador
// tiene la relación comercial y quien gestiona la solicitud.
test('con Subgestor de por medio, el aviso va al Subgestor y no al Gestor externo', function () {
    Notification::fake();

    $generator = srGeneratorOrganization();
    $subgestor = srSubgestorOrganization();
    $gestorExterno = srGestorOrganization();

    $waste = Waste::factory()->create(['status' => Waste::STATUS_APPROVED, 'organization_id' => $generator->id]);
    $approval = WasteTreatmentApproval::factory()->viable()->create([
        'organization_id' => $gestorExterno->id,
        'waste_id' => $waste->id,
        'delegated_by_organization_id' => $subgestor->id,
    ]);

    GeneratorSubgestorRelationship::query()->create([
        'generator_organization_id' => $generator->id,
        'subgestor_organization_id' => $subgestor->id,
    ]);

    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $creador = srActor(['service_requests.create', 'service_requests.update'], $generator->id);
    $subgestorEvaluador = srActor(['service_requests.evaluate'], $subgestor->id);
    $gestorEvaluador = srActor(['service_requests.evaluate'], $gestorExterno->id);

    $id = $this->actingAs($creador)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'counterparty_organization_id' => $subgestor->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertCreated()->json('service_request.id');

    $this->actingAs($creador)->postJson("/api/admin/service-requests/{$id}/submit")->assertOk();

    // El Gestor externo trata el residuo, pero la relación comercial es con el
    // Subgestor: el aviso va a quien gestiona la solicitud.
    Notification::assertSentTo($subgestorEvaluador, ServiceRequestSubmittedNotification::class);
    Notification::assertNotSentTo($gestorEvaluador, ServiceRequestSubmittedNotification::class);
});

test('al resolverse, se avisa al GENERADOR', function () {
    Notification::fake();

    $generator = srGeneratorOrganization();
    $gestor = srGestorOrganization();
    [$waste, $approval] = srViableItemFixture($generator, $gestor);
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);

    $creador = srActor(['service_requests.create', 'service_requests.update'], $generator->id);
    $lector = srActor(['service_requests.read'], $generator->id);
    $evaluador = srActor(['service_requests.evaluate'], $gestor->id);

    $id = $this->actingAs($creador)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'counterparty_organization_id' => $gestor->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertCreated()->json('service_request.id');

    $this->actingAs($creador)->postJson("/api/admin/service-requests/{$id}/submit")->assertOk();

    $item = WasteServiceRequest::query()->findOrFail($id)->items()->firstOrFail();

    $this->actingAs($evaluador)->postJson("/api/admin/service-requests/items/{$item->id}/approve")->assertOk();

    Notification::assertSentTo($lector, ServiceRequestDecidedNotification::class);
});

// Un rechazo también se avisa: sin esto, el Generador solo se enteraría
// entrando a mirar, que es justo lo que este cambio viene a quitar.
test('el rechazo también se avisa al Generador', function () {
    Notification::fake();

    $generator = srGeneratorOrganization();
    $gestor = srGestorOrganization();
    [$waste, $approval] = srViableItemFixture($generator, $gestor);
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);

    $creador = srActor(['service_requests.create', 'service_requests.update'], $generator->id);
    $lector = srActor(['service_requests.read'], $generator->id);
    $evaluador = srActor(['service_requests.evaluate'], $gestor->id);

    $id = $this->actingAs($creador)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'counterparty_organization_id' => $gestor->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertCreated()->json('service_request.id');

    $this->actingAs($creador)->postJson("/api/admin/service-requests/{$id}/submit")->assertOk();

    $item = WasteServiceRequest::query()->findOrFail($id)->items()->firstOrFail();

    $this->actingAs($evaluador)
        ->postJson("/api/admin/service-requests/items/{$item->id}/reject", ['notes' => 'Sin capacidad.'])
        ->assertOk();

    Notification::assertSentTo($lector, ServiceRequestDecidedNotification::class);
});

// La cabecera solo se mueve cuando TODOS los ítems están decididos (D-S01), y
// el aviso debe seguir esa misma regla: avisar a medias sería peor que no
// avisar.
test('con ítems todavía pendientes NO se avisa al Generador', function () {
    Notification::fake();

    $generator = srGeneratorOrganization();
    $gestor = srGestorOrganization();
    [$wasteA, $approvalA] = srViableItemFixture($generator, $gestor);
    [$wasteB, $approvalB] = srViableItemFixture($generator, $gestor);
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);

    $creador = srActor(['service_requests.create', 'service_requests.update'], $generator->id);
    $lector = srActor(['service_requests.read'], $generator->id);
    $evaluador = srActor(['service_requests.evaluate'], $gestor->id);

    $id = $this->actingAs($creador)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'counterparty_organization_id' => $gestor->id,
        'items' => [srItemPayload($wasteA, $approvalA), srItemPayload($wasteB, $approvalB)],
    ])->assertCreated()->json('service_request.id');

    $this->actingAs($creador)->postJson("/api/admin/service-requests/{$id}/submit")->assertOk();

    $primerItem = WasteServiceRequest::query()->findOrFail($id)->items()->orderBy('item_sequence')->first();

    $this->actingAs($evaluador)->postJson("/api/admin/service-requests/items/{$primerItem->id}/approve")->assertOk();

    Notification::assertNotSentTo($lector, ServiceRequestDecidedNotification::class);
});

// Respaldo al correo de la ORGANIZACIÓN: un Generador recién autoprovisionado
// por Carga Masiva nace con un correo placeholder que siempre rebota.
test('si el único destinatario tiene correo placeholder, se cae al correo de la organización', function () {
    Notification::fake();

    $generator = srGeneratorOrganization();
    $gestor = srGestorOrganization();
    $gestor->forceFill(['email' => 'contacto@gestor.test'])->save();

    [$waste, $approval] = srViableItemFixture($generator, $gestor);
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);

    $evaluador = srActor(['service_requests.evaluate'], $gestor->id);
    $evaluador->forceFill(['email' => 'placeholder@sin-correo.invalid'])->save();

    $creador = srActor(['service_requests.create', 'service_requests.update'], $generator->id);

    $id = $this->actingAs($creador)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'counterparty_organization_id' => $gestor->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertCreated()->json('service_request.id');

    $this->actingAs($creador)->postJson("/api/admin/service-requests/{$id}/submit")->assertOk();

    Notification::assertNotSentTo($evaluador, ServiceRequestSubmittedNotification::class);
    Notification::assertSentOnDemand(
        ServiceRequestSubmittedNotification::class,
        fn ($notification, $channels, $notifiable) => $notifiable->routes['mail'] === 'contacto@gestor.test',
    );
});

// ---------------------------------------------------------------------------
// Reapertura de una solicitud RECHAZADA (D-S23, endpoint agregado 2026-08-19).
//
// La transición `REJECTED -> DRAFT` llevaba sembrada en el workflow desde el
// lote original, pero sin endpoint: una solicitud rechazada era un punto final,
// y el correo de rechazo le promete al Generador que puede corregir y reenviar.
// ---------------------------------------------------------------------------

/**
 * Solicitud llevada hasta RECHAZADA. Devuelve [$serviceRequest, $generator,
 * $gestor, $creador].
 */
function srRejectedRequest(): array
{
    $generator = srGeneratorOrganization();
    $gestor = srGestorOrganization();
    [$waste, $approval] = srViableItemFixture($generator, $gestor);
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);

    $creador = srActor(['service_requests.create', 'service_requests.update'], $generator->id);
    $evaluador = srActor(['service_requests.evaluate'], $gestor->id);

    $id = test()->actingAs($creador)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'counterparty_organization_id' => $gestor->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertCreated()->json('service_request.id');

    test()->actingAs($creador)->postJson("/api/admin/service-requests/{$id}/submit")->assertOk();

    $item = WasteServiceRequest::query()->findOrFail($id)->items()->firstOrFail();

    test()->actingAs($evaluador)
        ->postJson("/api/admin/service-requests/items/{$item->id}/reject", ['notes' => 'Sin capacidad esta semana.'])
        ->assertOk();

    return [WasteServiceRequest::query()->findOrFail($id), $generator, $gestor, $creador];
}

test('el Generador reabre su solicitud rechazada y vuelve a Borrador', function () {
    [$serviceRequest, , , $creador] = srRejectedRequest();

    expect($serviceRequest->serviceStatus->code)->toBe('REJECTED');

    $this->actingAs($creador)
        ->postJson("/api/admin/service-requests/{$serviceRequest->id}/reopen")
        ->assertOk()
        ->assertJsonPath('service_request.service_status.code', 'DRAFT');

    expect(SecurityLog::query()->where('event_type', 'SERVICE_REQUEST_REOPENED')->exists())->toBeTrue();
});

// Sin esto la solicitud reabierta seria OTRO callejon sin salida: volveria a
// Borrador con sus items ya rechazados, y al reenviarla el destinatario no
// tendria nada que evaluar.
test('los ítems rechazados vuelven a Pendiente al reabrir', function () {
    [$serviceRequest, , , $creador] = srRejectedRequest();
    $item = $serviceRequest->items()->firstOrFail();

    expect($item->itemStatus->code)->toBe('REJECTED');

    $this->actingAs($creador)->postJson("/api/admin/service-requests/{$serviceRequest->id}/reopen")->assertOk();

    expect($item->fresh()->itemStatus->code)->toBe('PENDING');
});

// La observación del rechazo NO se borra: es la trazabilidad de por qué se
// reabrió.
test('reabrir conserva el motivo del rechazo en el ítem', function () {
    [$serviceRequest, , , $creador] = srRejectedRequest();

    $this->actingAs($creador)->postJson("/api/admin/service-requests/{$serviceRequest->id}/reopen")->assertOk();

    expect($serviceRequest->items()->firstOrFail()->observations)->toBe('Sin capacidad esta semana.');
});

// SUPUESTO señalado al usuario: se corrige lo rechazado sin obligar al
// destinatario a reevaluar lo que ya había dado por bueno.
test('los ítems ya ACEPTADOS se conservan al reabrir', function () {
    $generator = srGeneratorOrganization();
    $gestor = srGestorOrganization();
    [$wasteA, $approvalA] = srViableItemFixture($generator, $gestor);
    [$wasteB, $approvalB] = srViableItemFixture($generator, $gestor);
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);

    $creador = srActor(['service_requests.create', 'service_requests.update'], $generator->id);
    $evaluador = srActor(['service_requests.evaluate'], $gestor->id);

    $id = $this->actingAs($creador)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'counterparty_organization_id' => $gestor->id,
        'items' => [srItemPayload($wasteA, $approvalA), srItemPayload($wasteB, $approvalB)],
    ])->assertCreated()->json('service_request.id');

    $this->actingAs($creador)->postJson("/api/admin/service-requests/{$id}/submit")->assertOk();

    $items = WasteServiceRequest::query()->findOrFail($id)->items()->orderBy('item_sequence')->get();

    $this->actingAs($evaluador)->postJson("/api/admin/service-requests/items/{$items[0]->id}/approve")->assertOk();
    $this->actingAs($evaluador)
        ->postJson("/api/admin/service-requests/items/{$items[1]->id}/reject", ['notes' => 'No aplica.'])
        ->assertOk();

    $this->actingAs($creador)->postJson("/api/admin/service-requests/{$id}/reopen")->assertOk();

    expect($items[0]->fresh()->itemStatus->code)->toBe('ACCEPTED')
        ->and($items[1]->fresh()->itemStatus->code)->toBe('PENDING');
});

// El destinatario rechazó: la decisión de reintentar es de quien pide el
// servicio, no de quien lo negó.
test('el DESTINATARIO no puede reabrir', function () {
    [$serviceRequest, , $gestor] = srRejectedRequest();

    $gestorActor = srActor(['service_requests.update'], $gestor->id);

    $this->actingAs($gestorActor)
        ->postJson("/api/admin/service-requests/{$serviceRequest->id}/reopen")
        ->assertForbidden();

    expect($serviceRequest->fresh()->serviceStatus->code)->toBe('REJECTED');
});

test('solo se puede reabrir una solicitud RECHAZADA', function () {
    $generator = srGeneratorOrganization();
    $gestor = srGestorOrganization();
    [$waste, $approval] = srViableItemFixture($generator, $gestor);
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    $creador = srActor(['service_requests.create', 'service_requests.update'], $generator->id);

    $id = $this->actingAs($creador)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'counterparty_organization_id' => $gestor->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertCreated()->json('service_request.id');

    // Sigue en DRAFT: no hay nada que reabrir.
    $this->actingAs($creador)->postJson("/api/admin/service-requests/{$id}/reopen")
        ->assertUnprocessable()->assertJsonValidationErrors('service_status');
});

// Cierra el ciclo completo: lo que este endpoint venía a habilitar.
test('una solicitud reabierta se puede volver a enviar y resolver', function () {
    [$serviceRequest, , $gestor, $creador] = srRejectedRequest();

    $this->actingAs($creador)->postJson("/api/admin/service-requests/{$serviceRequest->id}/reopen")->assertOk();

    $this->actingAs($creador)->postJson("/api/admin/service-requests/{$serviceRequest->id}/submit")
        ->assertOk()->assertJsonPath('service_request.service_status.code', 'UNDER_REVIEW');

    $item = $serviceRequest->items()->firstOrFail();
    $evaluador = srActor(['service_requests.evaluate'], $gestor->id);

    $this->actingAs($evaluador)->postJson("/api/admin/service-requests/items/{$item->id}/approve")->assertOk();

    expect($serviceRequest->fresh()->serviceStatus->code)->toBe('APPROVED');
});

// ---------------------------------------------------------------------------
// Permisos por lado del flujo (2026-08-19). Hasta hoy los cinco
// `service_requests.*` estaban SOLO en ADMINISTRADOR: el rol operativo no podía
// ni crear una solicitud, y el técnico ambiental no podía evaluarla.
//
// Estos tests usan los ROLES REALES sembrados por `RolePermissionSeeder`, no
// permisos ad-hoc: comprueban el reparto, no la mecánica del endpoint (que ya
// cubren los tests de arriba).
// ---------------------------------------------------------------------------

/** Usuario con un rol REAL del catálogo, sembrado con sus permisos reales. */
function srUserWithSeededRole(string $roleCode, int $organizationId): User
{
    $user = User::factory()->create(['tenant_organization_id' => $organizationId]);
    $role = Role::query()->where('code', $roleCode)->firstOrFail();
    UserRole::query()->create(['user_id' => $user->id, 'role_id' => $role->id, 'is_active' => true]);

    return $user;
}

test('OPERACIONES puede crear y enviar una solicitud con los permisos reales del seeder', function () {
    $this->seed(PermissionSeeder::class);
    $this->seed(RolePermissionSeeder::class);

    $generator = srGeneratorOrganization();
    $gestor = srGestorOrganization();
    [$waste, $approval] = srViableItemFixture($generator, $gestor);
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);

    $operaciones = srUserWithSeededRole('OPERACIONES', $generator->id);

    $id = $this->actingAs($operaciones)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'counterparty_organization_id' => $gestor->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertCreated()->json('service_request.id');

    $this->actingAs($operaciones)->postJson("/api/admin/service-requests/{$id}/submit")
        ->assertOk()->assertJsonPath('service_request.service_status.code', 'UNDER_REVIEW');
});

test('TECNICO_AMBIENTAL puede evaluar con los permisos reales del seeder', function () {
    $this->seed(PermissionSeeder::class);
    $this->seed(RolePermissionSeeder::class);

    $generator = srGeneratorOrganization();
    $gestor = srGestorOrganization();
    [$waste, $approval] = srViableItemFixture($generator, $gestor);
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);

    $operaciones = srUserWithSeededRole('OPERACIONES', $generator->id);
    $tecnico = srUserWithSeededRole('TECNICO_AMBIENTAL', $gestor->id);

    $id = $this->actingAs($operaciones)->postJson('/api/admin/service-requests', [
        'branch_id' => $branch->id,
        'counterparty_organization_id' => $gestor->id,
        'items' => [srItemPayload($waste, $approval)],
    ])->assertCreated()->json('service_request.id');

    $this->actingAs($operaciones)->postJson("/api/admin/service-requests/{$id}/submit")->assertOk();

    $item = WasteServiceRequest::query()->findOrFail($id)->items()->firstOrFail();

    $this->actingAs($tecnico)->postJson("/api/admin/service-requests/items/{$item->id}/approve")->assertOk();
});

// El caso que motivó dar `evaluate` también a OPERACIONES: el rol operativo de
// un SUBGESTOR destinatario. Sin esto, un Subgestor necesitaria ADMINISTRADOR
// para resolver las solicitudes que se le dirigen.
test('OPERACIONES de un SUBGESTOR destinatario puede evaluar', function () {
    $this->seed(PermissionSeeder::class);
    $this->seed(RolePermissionSeeder::class);

    [$serviceRequest, $subgestor] = srDelegatedSubmittedRequest();
    $item = $serviceRequest->items()->firstOrFail();

    $operacionesSubgestor = srUserWithSeededRole('OPERACIONES', $subgestor->id);

    $this->actingAs($operacionesSubgestor)
        ->postJson("/api/admin/service-requests/items/{$item->id}/approve")
        ->assertOk();
});

// El permiso por si solo no basta: la Policy exige ademas SER el destinatario.
// Por eso conceder `evaluate` a OPERACIONES no abre nada en un Generador.
test('OPERACIONES de un tercero NO puede evaluar aunque tenga el permiso', function () {
    $this->seed(PermissionSeeder::class);
    $this->seed(RolePermissionSeeder::class);

    [$serviceRequest] = srRejectedRequest();
    $item = $serviceRequest->items()->firstOrFail();

    $ajeno = srGestorOrganization();
    $operacionesAjeno = srUserWithSeededRole('OPERACIONES', $ajeno->id);

    $this->actingAs($operacionesAjeno)
        ->postJson("/api/admin/service-requests/items/{$item->id}/approve")
        ->assertForbidden();
});
