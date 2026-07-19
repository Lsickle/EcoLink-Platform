<?php

use App\Models\Branch;
use App\Models\BranchTreatment;
use App\Models\BusinessRole;
use App\Models\MeasurementUnit;
use App\Models\Organization;
use App\Models\OrganizationBusinessRole;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\SecurityLog;
use App\Models\User;
use App\Models\UserRole;
use App\Models\Waste;
use App\Models\WasteOperationalStatus;
use App\Models\WasteStream;
use App\Models\WasteTreatmentApproval;
use App\Models\WasteType;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\PlatformOrganizationSeeder;
use Database\Seeders\RespelStatusSeeder;

// "Residuos Preaprobados" -- residuos de referencia
// (waste_type_id=PREAPPROVED) propiedad de una organización GESTOR
// (can_treat_waste=true), con una WasteTreatmentApproval auto-aprobada
// (ambos ejes) desde su creación. Acceso DUAL, mismo criterio que el resto
// del proyecto -- ver Waste::isAccessibleBy()/PreapprovedWastePolicy
// (invocada explícitamente, NO vía Gate::authorize(), porque WastePolicy ya
// ocupa la ranura auto-descubierta de Waste).

function preapprovedWasteActor(array $codes = [], ?int $tenantOrganizationId = null): User
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

function preapprovedWastePlatformStaffActor(array $codes = []): User
{
    $platform = Organization::query()->where('is_platform_tenant', true)->first()
        ?? Organization::factory()->create(['is_platform_tenant' => true]);

    return preapprovedWasteActor($codes, $platform->id);
}

/**
 * Organización con business_role GESTOR activo (can_treat_waste=true) --
 * requisito de negocio para poder declarar residuos preaprobados, mismo
 * helper conceptual que `organizationThatCanTreatWaste()` de
 * BranchTreatmentControllerTest (nombre distinto para evitar colisión de
 * función global entre archivos de test).
 */
function gestorOrganizationForPreapproved(): Organization
{
    $organization = Organization::factory()->create();
    $gestor = BusinessRole::factory()->create(['can_treat_waste' => true]);

    OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id,
        'business_role_id' => $gestor->id,
        'assigned_at' => now(),
        'is_active' => true,
    ]);

    return $organization->fresh();
}

function preapprovedWasteType(): WasteType
{
    return WasteType::query()->firstOrCreate(['code' => 'PREAPPROVED'], ['name' => 'Preaprobado', 'is_system' => true, 'is_active' => true]);
}

/**
 * Crea un Waste PREAPPROVED "manual" (sin pasar por el controller) para los
 * tests de show()/update()/activate()/deactivate() -- misma organización
 * GESTOR que ya tiene branch_treatments.
 */
function makePreapprovedWaste(Organization $organization, ?WasteTreatmentApproval $approval = null): Waste
{
    $waste = Waste::factory()->create([
        'organization_id' => $organization->id,
        'waste_type_id' => preapprovedWasteType()->id,
        'status' => 'CLS',
    ]);

    if ($approval) {
        $approval->update(['waste_id' => $waste->id, 'organization_id' => $organization->id]);
    }

    return $waste->fresh();
}

const PREAPPROVED_WASTE_ALL_PERMISSIONS = ['preapproved_wastes.read', 'preapproved_wastes.manage'];

// item 17/D-WF-02: RespelStatusSeeder (+ dependencias) necesario para
// cualquier WasteTreatmentApproval creada en esta suite -- ver mismo
// comentario en WasteControllerTest.
beforeEach(function () {
    MeasurementUnit::query()->firstOrCreate(['code' => 'KG'], ['name' => 'Kilogramo', 'is_system' => true, 'is_active' => true]);
    WasteOperationalStatus::query()->firstOrCreate(['code' => 'ACTIVE'], ['name' => 'Activo', 'is_system' => true, 'is_active' => true]);
    preapprovedWasteType();
    $this->seed(OrganizationStatusSeeder::class);
    $this->seed(PlatformOrganizationSeeder::class);
    $this->seed(RespelStatusSeeder::class);
});

// ---- Aislamiento tenant vs. platform staff ----

test('todos los endpoints devuelven 403 sin el permiso preapproved_wastes.* correspondiente', function () {
    $organization = gestorOrganizationForPreapproved();
    $waste = makePreapprovedWaste($organization);
    $actor = preapprovedWasteActor([], $organization->id);

    $this->actingAs($actor)->getJson('/api/admin/preapproved-wastes')->assertForbidden();
    $this->actingAs($actor)->postJson('/api/admin/preapproved-wastes', [])->assertForbidden();
    $this->actingAs($actor)->getJson("/api/admin/preapproved-wastes/{$waste->id}")->assertForbidden();
    $this->actingAs($actor)->putJson("/api/admin/preapproved-wastes/{$waste->id}", [])->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/preapproved-wastes/{$waste->id}/activate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/preapproved-wastes/{$waste->id}/deactivate")->assertForbidden();
});

test('un admin de tenant con permiso NO puede ver/editar preaprobados de OTRA organización', function () {
    $ownOrganization = gestorOrganizationForPreapproved();
    $otherOrganization = gestorOrganizationForPreapproved();
    $foreignWaste = makePreapprovedWaste($otherOrganization);

    $actor = preapprovedWasteActor(PREAPPROVED_WASTE_ALL_PERMISSIONS, $ownOrganization->id);

    $this->actingAs($actor)->getJson("/api/admin/preapproved-wastes/{$foreignWaste->id}")->assertForbidden();
    $this->actingAs($actor)->putJson("/api/admin/preapproved-wastes/{$foreignWaste->id}", ['name' => 'Hackeado'])->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/preapproved-wastes/{$foreignWaste->id}/activate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/preapproved-wastes/{$foreignWaste->id}/deactivate")->assertForbidden();
});

test('platform staff SÍ puede ver/editar preaprobados de CUALQUIER organización (cross-tenant por diseño)', function () {
    $organization = gestorOrganizationForPreapproved();
    $waste = makePreapprovedWaste($organization);

    $actor = preapprovedWastePlatformStaffActor(PREAPPROVED_WASTE_ALL_PERMISSIONS);

    $this->actingAs($actor)->getJson("/api/admin/preapproved-wastes/{$waste->id}")->assertOk();
    $this->actingAs($actor)->putJson("/api/admin/preapproved-wastes/{$waste->id}", ['name' => 'Modificado'])->assertOk();
});

// ---- index(): acceso dual + capacidad can_treat_waste ----

test('index acota el listado a la organización del actor cuando NO es platform staff, e ignora organization_id del query', function () {
    $ownOrganization = gestorOrganizationForPreapproved();
    $otherOrganization = gestorOrganizationForPreapproved();

    $ownWaste = makePreapprovedWaste($ownOrganization);
    $foreignWaste = makePreapprovedWaste($otherOrganization);

    $actor = preapprovedWasteActor(['preapproved_wastes.read'], $ownOrganization->id);

    $response = $this->actingAs($actor)
        ->getJson("/api/admin/preapproved-wastes?organization_id={$otherOrganization->id}")
        ->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($ownWaste->id)->not->toContain($foreignWaste->id);
});

test('index SOLO devuelve residuos de tipo PREAPPROVED, nunca residuos normales de la misma organización', function () {
    $organization = gestorOrganizationForPreapproved();
    $preapprovedWaste = makePreapprovedWaste($organization);
    $normalWaste = Waste::factory()->create(['organization_id' => $organization->id]);

    $actor = preapprovedWasteActor(['preapproved_wastes.read'], $organization->id);

    $response = $this->actingAs($actor)->getJson('/api/admin/preapproved-wastes')->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($preapprovedWaste->id)->not->toContain($normalWaste->id);
});

test('index para platform staff sin organization_id devuelve TODAS las organizaciones y eager-carga organization', function () {
    $organizationA = gestorOrganizationForPreapproved();
    $organizationB = gestorOrganizationForPreapproved();
    $wasteA = makePreapprovedWaste($organizationA);
    $wasteB = makePreapprovedWaste($organizationB);

    $actor = preapprovedWastePlatformStaffActor(['preapproved_wastes.read']);

    $response = $this->actingAs($actor)->getJson('/api/admin/preapproved-wastes')->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($wasteA->id)->toContain($wasteB->id);
    expect($response->json('data.0.organization'))->not->toBeNull();
});

test('index devuelve lista VACÍA (no 403) cuando la organización del actor NO tiene capacidad can_treat_waste', function () {
    $organizationWithoutCapability = Organization::factory()->create();
    $actor = preapprovedWasteActor(['preapproved_wastes.read'], $organizationWithoutCapability->id);

    $response = $this->actingAs($actor)->getJson('/api/admin/preapproved-wastes')->assertOk();

    expect($response->json('data'))->toBe([]);
});

// ---- store(): auto-aprobación + restricciones de negocio ----

test('store rechaza con 422 si la organización NO tiene business_role GESTOR (can_treat_waste)', function () {
    $organization = Organization::factory()->create(); // sin business_role GESTOR
    $branch = Branch::factory()->create(['organization_id' => $organization->id]);
    $branchTreatment = BranchTreatment::factory()->create(['organization_id' => $organization->id, 'branch_id' => $branch->id]);
    $wasteStream = WasteStream::factory()->create();

    $actor = preapprovedWasteActor(['preapproved_wastes.manage'], $organization->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/preapproved-wastes', [
        'name' => 'Residuo preaprobado de prueba',
        'waste_stream_ids' => [$wasteStream->id],
        'approval' => ['branch_treatment_id' => $branchTreatment->id],
    ])->assertUnprocessable();

    $response->assertJsonValidationErrors('organization_id');
});

test('store crea el residuo preaprobado Y su WasteTreatmentApproval auto-aprobada (ambos ejes) cuando la organización SÍ es GESTOR', function () {
    $organization = gestorOrganizationForPreapproved();
    $branch = Branch::factory()->create(['organization_id' => $organization->id]);
    $branchTreatment = BranchTreatment::factory()->create(['organization_id' => $organization->id, 'branch_id' => $branch->id]);
    $wasteStream = WasteStream::factory()->create();

    $actor = preapprovedWasteActor(['preapproved_wastes.manage'], $organization->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/preapproved-wastes', [
        'name' => 'Aceites usados aptos para coprocesamiento',
        'waste_stream_ids' => [$wasteStream->id],
        'approval' => [
            'branch_treatment_id' => $branchTreatment->id,
            'unit_price' => 850,
            'minimum_quantity' => 50,
            'maximum_quantity' => 5000,
        ],
    ])->assertCreated();

    $response->assertJsonPath('waste.organization_id', $organization->id)
        ->assertJsonPath('waste.status', 'CLS')
        ->assertJsonPath('waste.is_active', true);

    $waste = Waste::findOrFail($response->json('waste.id'));
    expect($waste->waste_type_id)->toBe(preapprovedWasteType()->id);

    $approval = WasteTreatmentApproval::query()->where('waste_id', $waste->id)->firstOrFail();
    expect($approval->technical_status)->toBe('APPROVED')
        ->and($approval->commercial_status)->toBe('APPROVED')
        ->and($approval->organization_id)->toBe($organization->id)
        ->and($approval->branch_treatment_id)->toBe($branchTreatment->id)
        ->and($approval->technical_approved_at)->not->toBeNull()
        ->and($approval->commercial_approved_at)->not->toBeNull()
        ->and((float) $approval->unit_price)->toBe(850.0);

    expect(SecurityLog::query()->where('event_type', 'PREAPPROVED_WASTE_CREATED')->exists())->toBeTrue();
});

test('store fuerza organization_id del actor para un admin de tenant, ignorando el payload (rechaza role-smuggling)', function () {
    $ownOrganization = gestorOrganizationForPreapproved();
    $otherOrganization = gestorOrganizationForPreapproved();
    $branch = Branch::factory()->create(['organization_id' => $ownOrganization->id]);
    $branchTreatment = BranchTreatment::factory()->create(['organization_id' => $ownOrganization->id, 'branch_id' => $branch->id]);
    $wasteStream = WasteStream::factory()->create();

    $actor = preapprovedWasteActor(['preapproved_wastes.manage'], $ownOrganization->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/preapproved-wastes', [
        'organization_id' => $otherOrganization->id,
        'name' => 'Residuo preaprobado',
        'waste_stream_ids' => [$wasteStream->id],
        'approval' => ['branch_treatment_id' => $branchTreatment->id],
    ])->assertCreated();

    $response->assertJsonPath('waste.organization_id', $ownOrganization->id);
});

test('store con platform staff exige organization_id explícito (422 si falta)', function () {
    $organization = gestorOrganizationForPreapproved();
    $branch = Branch::factory()->create(['organization_id' => $organization->id]);
    $branchTreatment = BranchTreatment::factory()->create(['organization_id' => $organization->id, 'branch_id' => $branch->id]);
    $wasteStream = WasteStream::factory()->create();

    $actor = preapprovedWastePlatformStaffActor(['preapproved_wastes.manage']);

    $this->actingAs($actor)->postJson('/api/admin/preapproved-wastes', [
        'name' => 'Residuo preaprobado',
        'waste_stream_ids' => [$wasteStream->id],
        'approval' => ['branch_treatment_id' => $branchTreatment->id],
    ])->assertUnprocessable()->assertJsonValidationErrors('organization_id');
});

test('store rechaza un branch_treatment_id que pertenece a OTRA organización (422)', function () {
    $organization = gestorOrganizationForPreapproved();
    $otherOrganization = gestorOrganizationForPreapproved();
    $foreignBranch = Branch::factory()->create(['organization_id' => $otherOrganization->id]);
    $foreignBranchTreatment = BranchTreatment::factory()->create(['organization_id' => $otherOrganization->id, 'branch_id' => $foreignBranch->id]);
    $wasteStream = WasteStream::factory()->create();

    $actor = preapprovedWasteActor(['preapproved_wastes.manage'], $organization->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/preapproved-wastes', [
        'name' => 'Residuo preaprobado',
        'waste_stream_ids' => [$wasteStream->id],
        'approval' => ['branch_treatment_id' => $foreignBranchTreatment->id],
    ])->assertUnprocessable();

    $response->assertJsonValidationErrors('approval.branch_treatment_id');
});

test('store rechaza si no se envía NINGUNA corriente Y/A ni código UN (422)', function () {
    $organization = gestorOrganizationForPreapproved();
    $branch = Branch::factory()->create(['organization_id' => $organization->id]);
    $branchTreatment = BranchTreatment::factory()->create(['organization_id' => $organization->id, 'branch_id' => $branch->id]);

    $actor = preapprovedWasteActor(['preapproved_wastes.manage'], $organization->id);

    $this->actingAs($actor)->postJson('/api/admin/preapproved-wastes', [
        'name' => 'Residuo preaprobado',
        'approval' => ['branch_treatment_id' => $branchTreatment->id],
    ])->assertUnprocessable()->assertJsonValidationErrors('waste_stream_ids');
});

test('store rechaza un waste_stream_id privado de OTRO tenant (IDOR)', function () {
    $organization = gestorOrganizationForPreapproved();
    $otherOrganization = Organization::factory()->create();
    $branch = Branch::factory()->create(['organization_id' => $organization->id]);
    $branchTreatment = BranchTreatment::factory()->create(['organization_id' => $organization->id, 'branch_id' => $branch->id]);
    $foreignWasteStream = WasteStream::factory()->create(['tenant_organization_id' => $otherOrganization->id]);

    $actor = preapprovedWasteActor(['preapproved_wastes.manage'], $organization->id);

    $this->actingAs($actor)->postJson('/api/admin/preapproved-wastes', [
        'name' => 'Residuo preaprobado',
        'waste_stream_ids' => [$foreignWasteStream->id],
        'approval' => ['branch_treatment_id' => $branchTreatment->id],
    ])->assertUnprocessable()->assertJsonValidationErrors('waste_stream_ids');
});

// ---- show(): 404 si no es PREAPPROVED ----

test('show devuelve 404 si el residuo NO es de tipo PREAPPROVED', function () {
    $organization = gestorOrganizationForPreapproved();
    $normalWaste = Waste::factory()->create(['organization_id' => $organization->id]);

    $actor = preapprovedWasteActor(['preapproved_wastes.read'], $organization->id);

    $this->actingAs($actor)->getJson("/api/admin/preapproved-wastes/{$normalWaste->id}")->assertNotFound();
});

/**
 * Hallazgo Medio de `especialista-seguridad`: antes del fix, `show()`/
 * `update()`/`activate()`/`deactivate()` corrían `assertIsPreapprovedWaste()`
 * (404 si el tipo no es PREAPPROVED) ANTES que la Policy -- eso permitía a
 * un actor SIN NINGÚN permiso `preapproved_wastes.*` distinguir, por el
 * código de respuesta, un ID que no es un residuo preaprobado (404) de un ID
 * que SÍ lo es pero de otra organización (403). Oráculo de enumeración por
 * ID, sin exponer datos pero sí existencia/tipo. Con la Policy corriendo
 * primero, ambos casos deben responder EXACTAMENTE igual (403) para un
 * actor sin permiso.
 */
test('show/update/activate/deactivate responden IGUAL (403) para un actor sin permiso, sea el ID un Waste normal inexistente-como-preaprobado o un PREAPPROVED real de otra organización', function (string $method, callable $url) {
    $actorOrganization = gestorOrganizationForPreapproved();
    $otherOrganization = gestorOrganizationForPreapproved();

    // (a) Waste normal (no PREAPPROVED), no existe como preaprobado.
    $normalWaste = Waste::factory()->create(['organization_id' => $actorOrganization->id]);

    // (b) PREAPPROVED real, pero de OTRA organización.
    $foreignPreapprovedWaste = makePreapprovedWaste($otherOrganization);

    $actor = preapprovedWasteActor([], $actorOrganization->id);

    $responseA = $this->actingAs($actor)->json($method, $url($normalWaste->id));
    $responseB = $this->actingAs($actor)->json($method, $url($foreignPreapprovedWaste->id));

    expect($responseA->status())->toBe($responseB->status())->toBe(403);
})->with([
    'show' => ['GET', fn (int $id) => "/api/admin/preapproved-wastes/{$id}"],
    'update' => ['PUT', fn (int $id) => "/api/admin/preapproved-wastes/{$id}"],
    'activate' => ['POST', fn (int $id) => "/api/admin/preapproved-wastes/{$id}/activate"],
    'deactivate' => ['POST', fn (int $id) => "/api/admin/preapproved-wastes/{$id}/deactivate"],
]);

// ---- update(): clasificación + términos de la aprobación ----

test('update permite editar la clasificación (corrientes Y/A) y los términos comerciales de la aprobación', function () {
    $organization = gestorOrganizationForPreapproved();
    $branch = Branch::factory()->create(['organization_id' => $organization->id]);
    $branchTreatment = BranchTreatment::factory()->create(['organization_id' => $organization->id, 'branch_id' => $branch->id]);
    $approval = WasteTreatmentApproval::factory()->viable()->create([
        'organization_id' => $organization->id,
        'branch_treatment_id' => $branchTreatment->id,
    ]);
    $waste = makePreapprovedWaste($organization, $approval);

    $newStream = WasteStream::factory()->create();

    $actor = preapprovedWasteActor(['preapproved_wastes.manage'], $organization->id);

    $this->actingAs($actor)->putJson("/api/admin/preapproved-wastes/{$waste->id}", [
        'name' => 'Nombre actualizado',
        'waste_stream_ids' => [$newStream->id],
        'approval' => ['unit_price' => 999.50],
    ])->assertOk()->assertJsonPath('waste.name', 'Nombre actualizado');

    expect($waste->wasteStreams()->pluck('waste_streams.id')->all())->toBe([$newStream->id]);
    expect((float) $approval->fresh()->unit_price)->toBe(999.5);
});

test('update rechaza un approval.branch_treatment_id que pertenece a OTRA organización (422)', function () {
    $organization = gestorOrganizationForPreapproved();
    $otherOrganization = gestorOrganizationForPreapproved();
    $branch = Branch::factory()->create(['organization_id' => $organization->id]);
    $branchTreatment = BranchTreatment::factory()->create(['organization_id' => $organization->id, 'branch_id' => $branch->id]);
    $approval = WasteTreatmentApproval::factory()->viable()->create([
        'organization_id' => $organization->id,
        'branch_treatment_id' => $branchTreatment->id,
    ]);
    $waste = makePreapprovedWaste($organization, $approval);

    $foreignBranch = Branch::factory()->create(['organization_id' => $otherOrganization->id]);
    $foreignBranchTreatment = BranchTreatment::factory()->create(['organization_id' => $otherOrganization->id, 'branch_id' => $foreignBranch->id]);

    $actor = preapprovedWasteActor(['preapproved_wastes.manage'], $organization->id);

    $this->actingAs($actor)->putJson("/api/admin/preapproved-wastes/{$waste->id}", [
        'approval' => ['branch_treatment_id' => $foreignBranchTreatment->id],
    ])->assertUnprocessable()->assertJsonValidationErrors('approval.branch_treatment_id');
});

// ---- activate()/deactivate(): cascada a la WasteTreatmentApproval ----

test('deactivate inactiva el residuo Y, en cascada, su(s) WasteTreatmentApproval asociada(s)', function () {
    $organization = gestorOrganizationForPreapproved();
    $branch = Branch::factory()->create(['organization_id' => $organization->id]);
    $branchTreatment = BranchTreatment::factory()->create(['organization_id' => $organization->id, 'branch_id' => $branch->id]);
    $approval = WasteTreatmentApproval::factory()->viable()->create([
        'organization_id' => $organization->id,
        'branch_treatment_id' => $branchTreatment->id,
        'is_active' => true,
    ]);
    $waste = makePreapprovedWaste($organization, $approval);

    $actor = preapprovedWasteActor(['preapproved_wastes.manage'], $organization->id);

    $this->actingAs($actor)->postJson("/api/admin/preapproved-wastes/{$waste->id}/deactivate")->assertOk();

    expect($waste->fresh()->is_active)->toBeFalse()
        ->and($approval->fresh()->is_active)->toBeFalse();
});

test('activate reactiva el residuo Y, en cascada, su(s) WasteTreatmentApproval asociada(s)', function () {
    $organization = gestorOrganizationForPreapproved();
    $branch = Branch::factory()->create(['organization_id' => $organization->id]);
    $branchTreatment = BranchTreatment::factory()->create(['organization_id' => $organization->id, 'branch_id' => $branch->id]);
    $approval = WasteTreatmentApproval::factory()->viable()->create([
        'organization_id' => $organization->id,
        'branch_treatment_id' => $branchTreatment->id,
        'is_active' => false,
    ]);
    $waste = makePreapprovedWaste($organization, $approval);
    $waste->forceFill(['is_active' => false])->save();

    $actor = preapprovedWasteActor(['preapproved_wastes.manage'], $organization->id);

    $this->actingAs($actor)->postJson("/api/admin/preapproved-wastes/{$waste->id}/activate")->assertOk();

    expect($waste->fresh()->is_active)->toBeTrue()
        ->and($approval->fresh()->is_active)->toBeTrue();
});

// ---- Consistencia con el matching dinámico ya existente ----

test('un residuo preaprobado creado por store() SÍ aparece en preapprovedMatches() de otro residuo con corriente compatible', function () {
    $gestorOrganization = gestorOrganizationForPreapproved();
    $branch = Branch::factory()->create(['organization_id' => $gestorOrganization->id]);
    $branchTreatment = BranchTreatment::factory()->create(['organization_id' => $gestorOrganization->id, 'branch_id' => $branch->id]);
    $sharedStream = WasteStream::factory()->create();

    $actor = preapprovedWasteActor(['preapproved_wastes.manage'], $gestorOrganization->id);

    $this->actingAs($actor)->postJson('/api/admin/preapproved-wastes', [
        'name' => 'Residuo preaprobado de referencia',
        'waste_stream_ids' => [$sharedStream->id],
        'approval' => ['branch_treatment_id' => $branchTreatment->id],
    ])->assertCreated();

    $generatorOrganization = Organization::factory()->create();
    $generatorWaste = Waste::factory()->create(['organization_id' => $generatorOrganization->id]);
    $generatorWaste->wasteStreams()->sync([$sharedStream->id => ['organization_id' => $generatorOrganization->id]]);

    $generatorActor = preapprovedWasteActor(['wastes.read'], $generatorOrganization->id);

    $response = $this->actingAs($generatorActor)
        ->getJson("/api/admin/wastes/{$generatorWaste->id}/preapproved-matches")
        ->assertOk();

    expect(collect($response->json('matches'))->pluck('branch_treatment_id'))->toContain($branchTreatment->id);
});
