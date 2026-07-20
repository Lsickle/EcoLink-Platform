<?php

use App\Models\Branch;
use App\Models\BranchLocation;
use App\Models\Organization;
use App\Models\Role;
use App\Models\User;
use App\Models\UserRole;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\PlatformOrganizationSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;

// Fase 4 "Cita de Recepción en Planta" -- CRUD mínimo de Muelles
// (`branch_locations`). Mismo patrón de fixtures que
// TransportScheduleControllerTest (prefijo `bl`).

beforeEach(function () {
    $this->seed(OrganizationStatusSeeder::class);
    $this->seed(PlatformOrganizationSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->seed(PermissionSeeder::class);
    $this->seed(RolePermissionSeeder::class);
});

function blAdminActor(?int $tenantOrganizationId = null): User
{
    $actor = User::factory()->create(['tenant_organization_id' => $tenantOrganizationId]);
    $role = Role::query()->where('code', 'ADMINISTRADOR')->firstOrFail();
    UserRole::query()->create(['user_id' => $actor->id, 'role_id' => $role->id, 'is_active' => true]);

    return $actor;
}

function blPlatformStaffActor(): User
{
    $platform = Organization::query()->where('is_platform_tenant', true)->first()
        ?? Organization::factory()->create(['is_platform_tenant' => true]);

    return blAdminActor($platform->id);
}

test('store crea un muelle perteneciente a una sede de la organización actora', function () {
    $organization = Organization::factory()->create();
    $branch = Branch::factory()->create(['organization_id' => $organization->id]);
    $actor = blAdminActor($organization->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/branch-locations', [
        'branch_id' => $branch->id,
        'code' => 'M01',
        'name' => 'Muelle 1',
    ])->assertCreated();

    $response->assertJsonPath('branch_location.branch_id', $branch->id)
        ->assertJsonPath('branch_location.code', 'M01')
        ->assertJsonPath('branch_location.is_active', true);

    expect(BranchLocation::query()->where('branch_id', $branch->id)->where('code', 'M01')->exists())->toBeTrue();
});

test('store rechaza (422) un branch_id que NO pertenece a la organización actora (anti-IDOR)', function () {
    $foreignOrganization = Organization::factory()->create();
    $foreignBranch = Branch::factory()->create(['organization_id' => $foreignOrganization->id]);
    $actor = blAdminActor(Organization::factory()->create()->id);

    $this->actingAs($actor)->postJson('/api/admin/branch-locations', [
        'branch_id' => $foreignBranch->id,
        'code' => 'M01',
        'name' => 'Muelle 1',
    ])->assertUnprocessable()->assertJsonValidationErrors('branch_id');

    expect(BranchLocation::query()->count())->toBe(0);
});

test('store rechaza (422) un código duplicado dentro de la MISMA sede', function () {
    $organization = Organization::factory()->create();
    $branch = Branch::factory()->create(['organization_id' => $organization->id]);
    $actor = blAdminActor($organization->id);

    $this->actingAs($actor)->postJson('/api/admin/branch-locations', [
        'branch_id' => $branch->id, 'code' => 'M01', 'name' => 'Muelle 1',
    ])->assertCreated();

    $this->actingAs($actor)->postJson('/api/admin/branch-locations', [
        'branch_id' => $branch->id, 'code' => 'M01', 'name' => 'Otro Muelle',
    ])->assertUnprocessable()->assertJsonValidationErrors('code');
});

test('show(): una organización ajena recibe 403 (IDOR)', function () {
    $organization = Organization::factory()->create();
    $branch = Branch::factory()->create(['organization_id' => $organization->id]);
    $location = BranchLocation::factory()->create(['branch_id' => $branch->id]);

    $foreignActor = blAdminActor(Organization::factory()->create()->id);

    $this->actingAs($foreignActor)->getJson("/api/admin/branch-locations/{$location->id}")->assertForbidden();
});

test('platform staff gestiona muelles de cualquier organización', function () {
    $organization = Organization::factory()->create();
    $branch = Branch::factory()->create(['organization_id' => $organization->id]);
    $location = BranchLocation::factory()->create(['branch_id' => $branch->id]);

    $staff = blPlatformStaffActor();

    $this->actingAs($staff)->getJson("/api/admin/branch-locations/{$location->id}")->assertOk();

    $this->actingAs($staff)->putJson("/api/admin/branch-locations/{$location->id}", [
        'name' => 'Muelle Renombrado',
    ])->assertOk()->assertJsonPath('branch_location.name', 'Muelle Renombrado');
});

test('update() rechaza (403) a una organización ajena', function () {
    $organization = Organization::factory()->create();
    $branch = Branch::factory()->create(['organization_id' => $organization->id]);
    $location = BranchLocation::factory()->create(['branch_id' => $branch->id]);

    $foreignActor = blAdminActor(Organization::factory()->create()->id);

    $this->actingAs($foreignActor)->putJson("/api/admin/branch-locations/{$location->id}", [
        'name' => 'Intento Ajeno',
    ])->assertForbidden();
});

test('index() acota el listado a las sedes de la organización actora', function () {
    $organization = Organization::factory()->create();
    $branch = Branch::factory()->create(['organization_id' => $organization->id]);
    BranchLocation::factory()->count(2)->create(['branch_id' => $branch->id]);

    $foreignOrganization = Organization::factory()->create();
    $foreignBranch = Branch::factory()->create(['organization_id' => $foreignOrganization->id]);
    BranchLocation::factory()->create(['branch_id' => $foreignBranch->id]);

    $actor = blAdminActor($organization->id);

    $response = $this->actingAs($actor)->getJson('/api/admin/branch-locations')->assertOk();

    expect($response->json('total'))->toBe(2);
});
