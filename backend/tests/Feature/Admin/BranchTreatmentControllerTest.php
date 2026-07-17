<?php

use App\Models\Branch;
use App\Models\BranchTreatment;
use App\Models\BusinessRole;
use App\Models\Organization;
use App\Models\OrganizationBusinessRole;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\SecurityLog;
use App\Models\Treatment;
use App\Models\UnCode;
use App\Models\User;
use App\Models\UserRole;
use App\Models\WasteStream;

// Habilitación de Tratamientos por Sede (RN-063/D-R02). Acceso DUAL, mismo
// patrón exacto que Sedes/Vehículos -- ver
// BranchTreatment::isAccessibleBy()/BranchTreatmentPolicy. Restricción de
// negocio: SOLO organizaciones GESTOR (can_treat_waste=true) pueden tener
// branch_treatments -- validado en BranchTreatmentController::store().

function branchTreatmentActor(array $codes = [], ?int $tenantOrganizationId = null): User
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

function branchTreatmentPlatformStaffActor(array $codes = []): User
{
    $platform = Organization::query()->where('is_platform_tenant', true)->first()
        ?? Organization::factory()->create(['is_platform_tenant' => true]);

    return branchTreatmentActor($codes, $platform->id);
}

/**
 * Organización con business_role GESTOR activo (can_treat_waste=true) --
 * requisito de negocio para poder tener branch_treatments.
 */
function organizationThatCanTreatWaste(): Organization
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

const BRANCH_TREATMENT_ALL_PERMISSIONS = ['branch_treatments.read', 'branch_treatments.create', 'branch_treatments.update', 'branch_treatments.activate', 'branch_treatments.deactivate'];

// ---- Aislamiento tenant vs. platform staff ----

test('todos los endpoints devuelven 403 sin el permiso branch_treatments.* correspondiente', function () {
    $organization = organizationThatCanTreatWaste();
    $branchTreatment = BranchTreatment::factory()->create(['organization_id' => $organization->id]);
    $actor = branchTreatmentActor([], $organization->id);

    $this->actingAs($actor)->getJson('/api/admin/branch-treatments')->assertForbidden();
    $this->actingAs($actor)->postJson('/api/admin/branch-treatments', [])->assertForbidden();
    $this->actingAs($actor)->getJson("/api/admin/branch-treatments/{$branchTreatment->id}")->assertForbidden();
    $this->actingAs($actor)->putJson("/api/admin/branch-treatments/{$branchTreatment->id}", [])->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/branch-treatments/{$branchTreatment->id}/activate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/branch-treatments/{$branchTreatment->id}/deactivate")->assertForbidden();
    $this->actingAs($actor)->getJson("/api/admin/branch-treatments/{$branchTreatment->id}/activity")->assertForbidden();
});

test('un admin de tenant con permiso NO puede ver/editar branch_treatments de OTRA organización', function () {
    $ownOrganization = organizationThatCanTreatWaste();
    $otherOrganization = organizationThatCanTreatWaste();
    $foreignBranchTreatment = BranchTreatment::factory()->create(['organization_id' => $otherOrganization->id]);

    $actor = branchTreatmentActor(BRANCH_TREATMENT_ALL_PERMISSIONS, $ownOrganization->id);

    $this->actingAs($actor)->getJson("/api/admin/branch-treatments/{$foreignBranchTreatment->id}")->assertForbidden();
    $this->actingAs($actor)->putJson("/api/admin/branch-treatments/{$foreignBranchTreatment->id}", ['operational_name' => 'Hackeado'])->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/branch-treatments/{$foreignBranchTreatment->id}/activate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/branch-treatments/{$foreignBranchTreatment->id}/deactivate")->assertForbidden();
});

test('platform staff SÍ puede ver/editar branch_treatments de CUALQUIER organización', function () {
    $organization = organizationThatCanTreatWaste();
    $branchTreatment = BranchTreatment::factory()->create(['organization_id' => $organization->id]);

    $actor = branchTreatmentPlatformStaffActor(BRANCH_TREATMENT_ALL_PERMISSIONS);

    $this->actingAs($actor)->getJson("/api/admin/branch-treatments/{$branchTreatment->id}")->assertOk();
    $this->actingAs($actor)->putJson("/api/admin/branch-treatments/{$branchTreatment->id}", ['operational_name' => 'Modificado'])->assertOk();
});

test('index acota el listado a la organización del actor cuando NO es platform staff, e ignora organization_id del query', function () {
    $ownOrganization = organizationThatCanTreatWaste();
    $otherOrganization = organizationThatCanTreatWaste();

    $ownBranchTreatment = BranchTreatment::factory()->create(['organization_id' => $ownOrganization->id]);
    $foreignBranchTreatment = BranchTreatment::factory()->create(['organization_id' => $otherOrganization->id]);

    $actor = branchTreatmentActor(['branch_treatments.read'], $ownOrganization->id);

    $response = $this->actingAs($actor)
        ->getJson("/api/admin/branch-treatments?organization_id={$otherOrganization->id}")
        ->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($ownBranchTreatment->id)->not->toContain($foreignBranchTreatment->id);
});

// ---- store(): restricción de negocio GESTOR (can_treat_waste) ----

test('store rechaza con 422 si la organización NO tiene business_role GESTOR (can_treat_waste)', function () {
    $organization = Organization::factory()->create(); // sin business_role GESTOR
    $branch = Branch::factory()->create(['organization_id' => $organization->id]);
    $treatment = Treatment::factory()->create();

    $actor = branchTreatmentActor(['branch_treatments.create'], $organization->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/branch-treatments', [
        'branch_id' => $branch->id,
        'treatment_id' => $treatment->id,
    ])->assertUnprocessable();

    $response->assertJsonValidationErrors('organization_id');
});

test('store crea el branch_treatment cuando la organización SÍ es GESTOR', function () {
    $organization = organizationThatCanTreatWaste();
    $branch = Branch::factory()->create(['organization_id' => $organization->id]);
    $treatment = Treatment::factory()->create();

    $actor = branchTreatmentActor(['branch_treatments.create'], $organization->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/branch-treatments', [
        'branch_id' => $branch->id,
        'treatment_id' => $treatment->id,
        'max_capacity' => 5000,
    ])->assertCreated();

    $response->assertJsonPath('branch_treatment.organization_id', $organization->id)
        ->assertJsonPath('branch_treatment.operational_status', 'ACTIVE')
        ->assertJsonPath('branch_treatment.is_active', true);

    expect(SecurityLog::query()->where('event_type', 'BRANCH_TREATMENT_CREATED')->exists())->toBeTrue();
});

test('store fuerza organization_id del actor para un admin de tenant, ignorando el payload (rechaza role-smuggling)', function () {
    $ownOrganization = organizationThatCanTreatWaste();
    $otherOrganization = organizationThatCanTreatWaste();
    $branch = Branch::factory()->create(['organization_id' => $ownOrganization->id]);
    $treatment = Treatment::factory()->create();

    $actor = branchTreatmentActor(['branch_treatments.create'], $ownOrganization->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/branch-treatments', [
        'organization_id' => $otherOrganization->id,
        'branch_id' => $branch->id,
        'treatment_id' => $treatment->id,
    ])->assertCreated();

    $response->assertJsonPath('branch_treatment.organization_id', $ownOrganization->id);
});

test('store con platform staff exige organization_id explícito (422 si falta)', function () {
    $organization = organizationThatCanTreatWaste();
    $branch = Branch::factory()->create(['organization_id' => $organization->id]);
    $treatment = Treatment::factory()->create();

    $actor = branchTreatmentPlatformStaffActor(['branch_treatments.create']);

    $this->actingAs($actor)->postJson('/api/admin/branch-treatments', [
        'branch_id' => $branch->id,
        'treatment_id' => $treatment->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('organization_id');
});

test('store con platform staff eligiendo una organización que NO es GESTOR es rechazado', function () {
    $organization = Organization::factory()->create();
    $branch = Branch::factory()->create(['organization_id' => $organization->id]);
    $treatment = Treatment::factory()->create();

    $actor = branchTreatmentPlatformStaffActor(['branch_treatments.create']);

    $this->actingAs($actor)->postJson('/api/admin/branch-treatments', [
        'organization_id' => $organization->id,
        'branch_id' => $branch->id,
        'treatment_id' => $treatment->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('organization_id');
});

// ---- branch_id debe pertenecer a la organización ----

test('branch_id que no pertenece a la organización es rechazado', function () {
    $organization = organizationThatCanTreatWaste();
    $otherOrganization = Organization::factory()->create();
    $foreignBranch = Branch::factory()->create(['organization_id' => $otherOrganization->id]);
    $treatment = Treatment::factory()->create();

    $actor = branchTreatmentActor(['branch_treatments.create'], $organization->id);

    $this->actingAs($actor)->postJson('/api/admin/branch-treatments', [
        'branch_id' => $foreignBranch->id,
        'treatment_id' => $treatment->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('branch_id');
});

// ---- update(): organization_id no editable ----

test('update ignora cambios a organization_id (no editable tras creación)', function () {
    $organization = organizationThatCanTreatWaste();
    $otherOrganization = organizationThatCanTreatWaste();
    $branchTreatment = BranchTreatment::factory()->create(['organization_id' => $organization->id]);

    $actor = branchTreatmentActor(['branch_treatments.update'], $organization->id);

    $this->actingAs($actor)->putJson("/api/admin/branch-treatments/{$branchTreatment->id}", [
        'organization_id' => $otherOrganization->id,
        'operational_name' => 'Nombre Actualizado',
    ])->assertOk()->assertJsonPath('branch_treatment.operational_name', 'Nombre Actualizado');

    expect($branchTreatment->fresh()->organization_id)->toBe($organization->id);
});

// ---- activate()/deactivate(): permiso específico ----

test('activate/deactivate exigen el permiso específico -- branch_treatments.update en exclusiva NO basta', function () {
    $organization = organizationThatCanTreatWaste();
    $branchTreatment = BranchTreatment::factory()->create(['organization_id' => $organization->id]);

    $actor = branchTreatmentActor(['branch_treatments.update'], $organization->id);

    $this->actingAs($actor)->postJson("/api/admin/branch-treatments/{$branchTreatment->id}/activate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/branch-treatments/{$branchTreatment->id}/deactivate")->assertForbidden();
});

test('activate/deactivate togglean operational_status/is_active', function () {
    $organization = organizationThatCanTreatWaste();
    $branchTreatment = BranchTreatment::factory()->create(['organization_id' => $organization->id, 'operational_status' => 'ACTIVE', 'is_active' => true]);

    $actor = branchTreatmentActor(['branch_treatments.update', 'branch_treatments.activate', 'branch_treatments.deactivate'], $organization->id);

    $this->actingAs($actor)->postJson("/api/admin/branch-treatments/{$branchTreatment->id}/deactivate")->assertOk();
    expect($branchTreatment->fresh()->operational_status)->toBe('INACTIVE')->and($branchTreatment->fresh()->is_active)->toBeFalse();

    $this->actingAs($actor)->postJson("/api/admin/branch-treatments/{$branchTreatment->id}/activate")->assertOk();
    expect($branchTreatment->fresh()->operational_status)->toBe('ACTIVE')->and($branchTreatment->fresh()->is_active)->toBeTrue();
});

// ---- syncAllowedWasteStreams()/syncAllowedUnCodes() ----

test('syncAllowedWasteStreams reemplaza la pivote completa', function () {
    $organization = organizationThatCanTreatWaste();
    $branchTreatment = BranchTreatment::factory()->create(['organization_id' => $organization->id]);
    $streamA = WasteStream::factory()->create();
    $streamB = WasteStream::factory()->create();
    $streamC = WasteStream::factory()->create();

    $branchTreatment->allowedWasteStreams()->sync([$streamA->id, $streamB->id]);

    $actor = branchTreatmentActor(['branch_treatments.update'], $organization->id);

    $this->actingAs($actor)->putJson("/api/admin/branch-treatments/{$branchTreatment->id}/allowed-waste-streams", [
        'waste_stream_ids' => [$streamB->id, $streamC->id],
    ])->assertOk();

    $ids = $branchTreatment->allowedWasteStreams()->pluck('waste_streams.id')->sort()->values();
    expect($ids->all())->toBe(collect([$streamB->id, $streamC->id])->sort()->values()->all());
});

test('syncAllowedWasteStreams acepta arreglo vacío para limpiar la pivote', function () {
    $organization = organizationThatCanTreatWaste();
    $branchTreatment = BranchTreatment::factory()->create(['organization_id' => $organization->id]);
    $stream = WasteStream::factory()->create();
    $branchTreatment->allowedWasteStreams()->sync([$stream->id]);

    $actor = branchTreatmentActor(['branch_treatments.update'], $organization->id);

    $this->actingAs($actor)->putJson("/api/admin/branch-treatments/{$branchTreatment->id}/allowed-waste-streams", [
        'waste_stream_ids' => [],
    ])->assertOk();

    expect($branchTreatment->allowedWasteStreams()->count())->toBe(0);
});

test('syncAllowedWasteStreams rechaza waste_stream_ids inexistentes', function () {
    $organization = organizationThatCanTreatWaste();
    $branchTreatment = BranchTreatment::factory()->create(['organization_id' => $organization->id]);

    $actor = branchTreatmentActor(['branch_treatments.update'], $organization->id);

    $this->actingAs($actor)->putJson("/api/admin/branch-treatments/{$branchTreatment->id}/allowed-waste-streams", [
        'waste_stream_ids' => [999999],
    ])->assertUnprocessable()->assertJsonValidationErrors('waste_stream_ids.0');
});

test('syncAllowedUnCodes reemplaza la pivote completa', function () {
    $organization = organizationThatCanTreatWaste();
    $branchTreatment = BranchTreatment::factory()->create(['organization_id' => $organization->id]);
    $unCodeA = UnCode::factory()->create();
    $unCodeB = UnCode::factory()->create();

    $actor = branchTreatmentActor(['branch_treatments.update'], $organization->id);

    $this->actingAs($actor)->putJson("/api/admin/branch-treatments/{$branchTreatment->id}/allowed-un-codes", [
        'un_code_ids' => [$unCodeA->id, $unCodeB->id],
    ])->assertOk();

    expect($branchTreatment->allowedUnCodes()->count())->toBe(2);
});

test('sync de corrientes/un_codes exige el mismo acceso dual que update()', function () {
    $ownOrganization = organizationThatCanTreatWaste();
    $otherOrganization = organizationThatCanTreatWaste();
    $foreignBranchTreatment = BranchTreatment::factory()->create(['organization_id' => $otherOrganization->id]);

    $actor = branchTreatmentActor(['branch_treatments.update'], $ownOrganization->id);

    $this->actingAs($actor)->putJson("/api/admin/branch-treatments/{$foreignBranchTreatment->id}/allowed-waste-streams", [
        'waste_stream_ids' => [],
    ])->assertForbidden();
});

// ---- Hallazgo 1 (Alto, especialista-seguridad): IDOR cross-tenant en corrientes/códigos UN permitidos ----
// A diferencia de `Treatment` (siempre global), `WasteStream`/`UnCode` admiten registros
// privados por tenant -- sync() debe verificar isAccessibleBy() antes de persistir.

test('syncAllowedWasteStreams rechaza un waste_stream_id privado de OTRO tenant (RN-063/IDOR)', function () {
    $ownOrganization = organizationThatCanTreatWaste();
    $otherOrganization = Organization::factory()->create();
    $branchTreatment = BranchTreatment::factory()->create(['organization_id' => $ownOrganization->id]);
    $foreignWasteStream = WasteStream::factory()->create(['tenant_organization_id' => $otherOrganization->id]);

    $actor = branchTreatmentActor(['branch_treatments.update'], $ownOrganization->id);

    $this->actingAs($actor)->putJson("/api/admin/branch-treatments/{$branchTreatment->id}/allowed-waste-streams", [
        'waste_stream_ids' => [$foreignWasteStream->id],
    ])->assertUnprocessable()->assertJsonValidationErrors('waste_stream_ids');

    expect($branchTreatment->allowedWasteStreams()->count())->toBe(0);
});

test('syncAllowedUnCodes rechaza un un_code_id privado de OTRO tenant (RN-063/IDOR)', function () {
    $ownOrganization = organizationThatCanTreatWaste();
    $otherOrganization = Organization::factory()->create();
    $branchTreatment = BranchTreatment::factory()->create(['organization_id' => $ownOrganization->id]);
    $foreignUnCode = UnCode::factory()->create(['tenant_organization_id' => $otherOrganization->id]);

    $actor = branchTreatmentActor(['branch_treatments.update'], $ownOrganization->id);

    $this->actingAs($actor)->putJson("/api/admin/branch-treatments/{$branchTreatment->id}/allowed-un-codes", [
        'un_code_ids' => [$foreignUnCode->id],
    ])->assertUnprocessable()->assertJsonValidationErrors('un_code_ids');

    expect($branchTreatment->allowedUnCodes()->count())->toBe(0);
});

test('syncAllowedWasteStreams SÍ acepta un waste_stream_id privado del PROPIO tenant', function () {
    $organization = organizationThatCanTreatWaste();
    $branchTreatment = BranchTreatment::factory()->create(['organization_id' => $organization->id]);
    $ownWasteStream = WasteStream::factory()->create(['tenant_organization_id' => $organization->id]);

    $actor = branchTreatmentActor(['branch_treatments.update'], $organization->id);

    $this->actingAs($actor)->putJson("/api/admin/branch-treatments/{$branchTreatment->id}/allowed-waste-streams", [
        'waste_stream_ids' => [$ownWasteStream->id],
    ])->assertOk();

    expect($branchTreatment->allowedWasteStreams()->count())->toBe(1);
});

// ---- Hallazgo 3 (Bajo-Medio, especialista-seguridad): exists no excluye inactivos ----

test('store rechaza un treatment_id inactivo (422)', function () {
    $organization = organizationThatCanTreatWaste();
    $branch = Branch::factory()->create(['organization_id' => $organization->id]);
    $inactiveTreatment = Treatment::factory()->create(['is_active' => false]);

    $actor = branchTreatmentActor(['branch_treatments.create'], $organization->id);

    $this->actingAs($actor)->postJson('/api/admin/branch-treatments', [
        'branch_id' => $branch->id,
        'treatment_id' => $inactiveTreatment->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('treatment_id');
});

test('update rechaza un treatment_id inactivo (422)', function () {
    $organization = organizationThatCanTreatWaste();
    $branchTreatment = BranchTreatment::factory()->create(['organization_id' => $organization->id]);
    $inactiveTreatment = Treatment::factory()->create(['is_active' => false]);

    $actor = branchTreatmentActor(['branch_treatments.update'], $organization->id);

    $this->actingAs($actor)->putJson("/api/admin/branch-treatments/{$branchTreatment->id}", [
        'treatment_id' => $inactiveTreatment->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('treatment_id');
});

test('syncAllowedWasteStreams rechaza un waste_stream_id inactivo (422)', function () {
    $organization = organizationThatCanTreatWaste();
    $branchTreatment = BranchTreatment::factory()->create(['organization_id' => $organization->id]);
    $inactiveStream = WasteStream::factory()->create(['is_active' => false]);

    $actor = branchTreatmentActor(['branch_treatments.update'], $organization->id);

    $this->actingAs($actor)->putJson("/api/admin/branch-treatments/{$branchTreatment->id}/allowed-waste-streams", [
        'waste_stream_ids' => [$inactiveStream->id],
    ])->assertUnprocessable()->assertJsonValidationErrors('waste_stream_ids.0');
});

test('syncAllowedUnCodes rechaza un un_code_id inactivo (422)', function () {
    $organization = organizationThatCanTreatWaste();
    $branchTreatment = BranchTreatment::factory()->create(['organization_id' => $organization->id]);
    $inactiveUnCode = UnCode::factory()->create(['is_active' => false]);

    $actor = branchTreatmentActor(['branch_treatments.update'], $organization->id);

    $this->actingAs($actor)->putJson("/api/admin/branch-treatments/{$branchTreatment->id}/allowed-un-codes", [
        'un_code_ids' => [$inactiveUnCode->id],
    ])->assertUnprocessable()->assertJsonValidationErrors('un_code_ids.0');
});

// ---- activity() ----

test('activity exige AMBOS: audit.read Y accesibilidad del branch_treatment', function () {
    $organization = organizationThatCanTreatWaste();
    $branchTreatment = BranchTreatment::factory()->create(['organization_id' => $organization->id]);

    $noAuditRead = branchTreatmentActor(['branch_treatments.update', 'branch_treatments.activate', 'branch_treatments.deactivate'], $organization->id);
    $this->actingAs($noAuditRead)->getJson("/api/admin/branch-treatments/{$branchTreatment->id}/activity")->assertForbidden();

    $actor = branchTreatmentActor(['branch_treatments.update', 'branch_treatments.activate', 'branch_treatments.deactivate', 'audit.read'], $organization->id);
    $this->actingAs($actor)->postJson("/api/admin/branch-treatments/{$branchTreatment->id}/deactivate")->assertOk();

    $response = $this->actingAs($actor)->getJson("/api/admin/branch-treatments/{$branchTreatment->id}/activity")->assertOk();
    $events = collect($response->json('data'))->pluck('event_type');
    expect($events)->toContain('BRANCH_TREATMENT_DEACTIVATED');
});

// ---- KPIs ----

test('index calcula los KPIs (total/active/inactive) con la MISMA visibilidad que el listado', function () {
    $organization = organizationThatCanTreatWaste();
    $otherOrganization = organizationThatCanTreatWaste();

    BranchTreatment::factory()->count(2)->create(['organization_id' => $organization->id, 'is_active' => true]);
    BranchTreatment::factory()->create(['organization_id' => $organization->id, 'is_active' => false]);
    BranchTreatment::factory()->count(5)->create(['organization_id' => $otherOrganization->id, 'is_active' => true]);

    $actor = branchTreatmentActor(['branch_treatments.read'], $organization->id);

    $response = $this->actingAs($actor)->getJson('/api/admin/branch-treatments')->assertOk();

    expect($response->json('kpis'))->toBe([
        'total' => 3,
        'active' => 2,
        'inactive' => 1,
    ]);
});
