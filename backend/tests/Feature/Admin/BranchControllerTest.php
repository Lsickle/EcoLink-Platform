<?php

use App\Models\Branch;
use App\Models\BranchType;
use App\Models\Department;
use App\Models\Municipality;
use App\Models\Organization;
use App\Models\OrganizationContact;
use App\Models\Permission;
use App\Models\Person;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\SecurityLog;
use App\Models\User;
use App\Models\UserRole;

// CRUD de Sedes (Branches) vs. Figma. Acceso DUAL (a diferencia de
// OrganizationController, exclusivo de platform staff): platform staff
// gestiona TODAS las sedes, un admin de tenant solo las de su propia
// organización -- ver Branch::isAccessibleBy()/BranchPolicy.

function branchActor(array $codes = [], ?int $tenantOrganizationId = null): User
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

function branchPlatformStaffActor(array $codes = []): User
{
    $platform = Organization::query()->where('is_platform_tenant', true)->first()
        ?? Organization::factory()->create(['is_platform_tenant' => true]);

    return branchActor($codes, $platform->id);
}

const BRANCH_ALL_PERMISSIONS = ['branches.read', 'branches.create', 'branches.update', 'branches.activate', 'branches.deactivate'];

// ---- Aislamiento tenant vs. platform staff (9 endpoints) ----

test('todos los endpoints devuelven 403 sin el permiso branches.* correspondiente', function () {
    $organization = Organization::factory()->create();
    $branch = Branch::factory()->create(['organization_id' => $organization->id]);
    $actor = branchActor([], $organization->id);

    $this->actingAs($actor)->getJson('/api/admin/branches')->assertForbidden();
    $this->actingAs($actor)->postJson('/api/admin/branches', [])->assertForbidden();
    $this->actingAs($actor)->getJson("/api/admin/branches/{$branch->id}")->assertForbidden();
    $this->actingAs($actor)->putJson("/api/admin/branches/{$branch->id}", [])->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/branches/{$branch->id}/activate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/branches/{$branch->id}/deactivate")->assertForbidden();
    $this->actingAs($actor)->getJson("/api/admin/branches/{$branch->id}/users")->assertForbidden();
    $this->actingAs($actor)->getJson("/api/admin/branches/{$branch->id}/contacts")->assertForbidden();
    $this->actingAs($actor)->getJson("/api/admin/branches/{$branch->id}/activity")->assertForbidden();
});

test('un admin de tenant con permiso NO puede ver/editar sedes de OTRA organización (view/update)', function () {
    $ownOrganization = Organization::factory()->create();
    $otherOrganization = Organization::factory()->create();
    $foreignBranch = Branch::factory()->create(['organization_id' => $otherOrganization->id]);

    $actor = branchActor(BRANCH_ALL_PERMISSIONS, $ownOrganization->id);

    $this->actingAs($actor)->getJson("/api/admin/branches/{$foreignBranch->id}")->assertForbidden();
    $this->actingAs($actor)->putJson("/api/admin/branches/{$foreignBranch->id}", ['name' => 'Hackeado'])->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/branches/{$foreignBranch->id}/activate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/branches/{$foreignBranch->id}/deactivate")->assertForbidden();
    $this->actingAs($actor)->getJson("/api/admin/branches/{$foreignBranch->id}/users")->assertForbidden();
    $this->actingAs($actor)->getJson("/api/admin/branches/{$foreignBranch->id}/contacts")->assertForbidden();
    $this->actingAs($actor)->getJson("/api/admin/branches/{$foreignBranch->id}/activity")->assertForbidden();
});

test('platform staff SÍ puede ver/editar sedes de CUALQUIER organización', function () {
    $organization = Organization::factory()->create();
    $branch = Branch::factory()->create(['organization_id' => $organization->id]);

    $actor = branchPlatformStaffActor(BRANCH_ALL_PERMISSIONS);

    $this->actingAs($actor)->getJson("/api/admin/branches/{$branch->id}")->assertOk();
    $this->actingAs($actor)->putJson("/api/admin/branches/{$branch->id}", ['name' => 'Renombrada'])->assertOk();
});

test('index acota el listado a la organización del actor cuando NO es platform staff, e ignora organization_id del query', function () {
    $ownOrganization = Organization::factory()->create();
    $otherOrganization = Organization::factory()->create();

    $ownBranch = Branch::factory()->create(['organization_id' => $ownOrganization->id]);
    $foreignBranch = Branch::factory()->create(['organization_id' => $otherOrganization->id]);

    $actor = branchActor(['branches.read'], $ownOrganization->id);

    $response = $this->actingAs($actor)
        ->getJson("/api/admin/branches?organization_id={$otherOrganization->id}")
        ->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($ownBranch->id)->not->toContain($foreignBranch->id);
});

test('index respeta organization_id del query SOLO para platform staff', function () {
    $organizationA = Organization::factory()->create();
    $organizationB = Organization::factory()->create();

    $branchA = Branch::factory()->create(['organization_id' => $organizationA->id]);
    $branchB = Branch::factory()->create(['organization_id' => $organizationB->id]);

    $actor = branchPlatformStaffActor(['branches.read']);

    $response = $this->actingAs($actor)
        ->getJson("/api/admin/branches?organization_id={$organizationA->id}")
        ->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($branchA->id)->not->toContain($branchB->id);
});

test('index() eager-carga organization/municipality por fila (regresión: el listado mostraba "—" siempre)', function () {
    $organization = Organization::factory()->create(['legal_name' => 'Industrias de Prueba S.A.S.']);
    $municipality = Municipality::factory()->create(['name' => 'CIUDAD DE PRUEBA']);
    Branch::factory()->create(['organization_id' => $organization->id, 'municipality_id' => $municipality->id]);

    $actor = branchPlatformStaffActor(['branches.read']);

    $response = $this->actingAs($actor)->getJson('/api/admin/branches')->assertOk();

    $row = collect($response->json('data'))->firstWhere('organization_id', $organization->id);
    expect($row['organization']['legal_name'])->toBe('Industrias de Prueba S.A.S.')
        ->and($row['municipality']['name'])->toBe('CIUDAD DE PRUEBA');
});

// ---- store(): anti-role-smuggling ----

test('store fuerza organization_id del actor para un admin de tenant, ignorando el payload (rechaza role-smuggling)', function () {
    $ownOrganization = Organization::factory()->create();
    $otherOrganization = Organization::factory()->create();
    $branchType = BranchType::factory()->create();

    $actor = branchActor(['branches.create'], $ownOrganization->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/branches', [
        'organization_id' => $otherOrganization->id,
        'branch_type_id' => $branchType->id,
        'code' => 'SEDE-01',
        'name' => 'Sede de Prueba',
    ])->assertCreated();

    $branch = Branch::query()->where('code', 'SEDE-01')->firstOrFail();
    expect($branch->organization_id)->toBe($ownOrganization->id)
        ->and($branch->organization_id)->not->toBe($otherOrganization->id)
        ->and($branch->created_by)->toBe($actor->id);

    $response->assertJsonPath('branch.organization_id', $ownOrganization->id);

    expect(SecurityLog::query()->where('event_type', 'BRANCH_CREATED')->where('metadata->branch_id', $branch->id)->exists())->toBeTrue();
});

test('store exige organization_id explícito para platform staff (422 si falta)', function () {
    $branchType = BranchType::factory()->create();
    $actor = branchPlatformStaffActor(['branches.create']);

    $this->actingAs($actor)->postJson('/api/admin/branches', [
        'branch_type_id' => $branchType->id,
        'code' => 'SEDE-02',
        'name' => 'Sede Sin Organización',
    ])->assertUnprocessable()->assertJsonValidationErrors('organization_id');
});

test('store con platform staff crea la sede en la organización indicada', function () {
    $organization = Organization::factory()->create();
    $branchType = BranchType::factory()->create();
    $actor = branchPlatformStaffActor(['branches.create']);

    $this->actingAs($actor)->postJson('/api/admin/branches', [
        'organization_id' => $organization->id,
        'branch_type_id' => $branchType->id,
        'code' => 'SEDE-03',
        'name' => 'Sede Plataforma',
    ])->assertCreated()->assertJsonPath('branch.organization_id', $organization->id);
});

// ---- unicidad de code excluye soft-deletes ----

test('code es único por organización y EXCLUYE sedes soft-eliminadas', function () {
    $organization = Organization::factory()->create();
    $branchType = BranchType::factory()->create();
    $actor = branchActor(['branches.create'], $organization->id);

    $this->actingAs($actor)->postJson('/api/admin/branches', [
        'branch_type_id' => $branchType->id, 'code' => 'DUP-01', 'name' => 'Primera',
    ])->assertCreated();

    // duplicado en la MISMA organización -> 422.
    $this->actingAs($actor)->postJson('/api/admin/branches', [
        'branch_type_id' => $branchType->id, 'code' => 'DUP-01', 'name' => 'Segunda',
    ])->assertUnprocessable()->assertJsonValidationErrors('code');

    $existing = Branch::query()->where('code', 'DUP-01')->firstOrFail();
    $existing->delete();

    // tras soft-delete, el code queda libre de nuevo.
    $this->actingAs($actor)->postJson('/api/admin/branches', [
        'branch_type_id' => $branchType->id, 'code' => 'DUP-01', 'name' => 'Tercera',
    ])->assertCreated();
});

test('el mismo code SÍ puede repetirse en organizaciones DISTINTAS', function () {
    $organizationA = Organization::factory()->create();
    $organizationB = Organization::factory()->create();
    $branchType = BranchType::factory()->create();

    $actorA = branchActor(['branches.create'], $organizationA->id);
    $actorB = branchActor(['branches.create'], $organizationB->id);

    $this->actingAs($actorA)->postJson('/api/admin/branches', [
        'branch_type_id' => $branchType->id, 'code' => 'COMPARTIDO', 'name' => 'Sede A',
    ])->assertCreated();

    $this->actingAs($actorB)->postJson('/api/admin/branches', [
        'branch_type_id' => $branchType->id, 'code' => 'COMPARTIDO', 'name' => 'Sede B',
    ])->assertCreated();
});

// ---- update(): organization_id no editable ----

test('update ignora cambios a organization_id (no editable tras creación)', function () {
    $organization = Organization::factory()->create();
    $otherOrganization = Organization::factory()->create();
    $branch = Branch::factory()->create(['organization_id' => $organization->id]);

    $actor = branchActor(['branches.update'], $organization->id);

    $this->actingAs($actor)->putJson("/api/admin/branches/{$branch->id}", [
        'organization_id' => $otherOrganization->id,
        'name' => 'Nombre Actualizado',
    ])->assertOk()->assertJsonPath('branch.name', 'Nombre Actualizado');

    expect($branch->fresh()->organization_id)->toBe($organization->id);
    expect(SecurityLog::query()->where('event_type', 'BRANCH_UPDATED')->where('metadata->branch_id', $branch->id)->exists())->toBeTrue();
});

// ---- coherencia de la cadena geográfica ----

test('store rechaza con 422 una cadena geográfica incoherente (municipio que no pertenece al departamento)', function () {
    $organization = Organization::factory()->create();
    $branchType = BranchType::factory()->create();
    $departmentA = Department::factory()->create();
    $departmentB = Department::factory()->create();
    $municipalityOfB = Municipality::factory()->create(['department_id' => $departmentB->id]);

    $actor = branchActor(['branches.create'], $organization->id);

    $this->actingAs($actor)->postJson('/api/admin/branches', [
        'branch_type_id' => $branchType->id, 'code' => 'GEO-01', 'name' => 'Sede Geo',
        'department_id' => $departmentA->id,
        'municipality_id' => $municipalityOfB->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('municipality_id');
});

// ---- activate()/deactivate(): permiso específico, no solo `update` ----

test('activate/deactivate exigen el permiso específico -- branches.update en exclusiva NO basta', function () {
    $organization = Organization::factory()->create();
    $branch = Branch::factory()->create(['organization_id' => $organization->id]);

    $actor = branchActor(['branches.update'], $organization->id);

    $this->actingAs($actor)->postJson("/api/admin/branches/{$branch->id}/activate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/branches/{$branch->id}/deactivate")->assertForbidden();
});

test('activate/deactivate togglean status/is_active y registran auditoría', function () {
    $organization = Organization::factory()->create();
    $branch = Branch::factory()->create(['organization_id' => $organization->id, 'status' => 'ACTIVE', 'is_active' => true]);

    $actor = branchActor(['branches.update', 'branches.activate', 'branches.deactivate'], $organization->id);

    $this->actingAs($actor)->postJson("/api/admin/branches/{$branch->id}/deactivate")->assertOk();
    expect($branch->fresh()->status)->toBe('INACTIVE')->and($branch->fresh()->is_active)->toBeFalse();

    $this->actingAs($actor)->postJson("/api/admin/branches/{$branch->id}/activate")->assertOk();
    expect($branch->fresh()->status)->toBe('ACTIVE')->and($branch->fresh()->is_active)->toBeTrue();

    expect(SecurityLog::query()->where('event_type', 'BRANCH_ACTIVATED')->exists())->toBeTrue()
        ->and(SecurityLog::query()->where('event_type', 'BRANCH_DEACTIVATED')->exists())->toBeTrue();
});

// ---- users()/contacts()/activity() ----

test('users lista los usuarios cuyo branch_id es la sede', function () {
    $organization = Organization::factory()->create();
    $branch = Branch::factory()->create(['organization_id' => $organization->id]);

    $inBranch = User::factory()->create(['branch_id' => $branch->id]);
    $outsideBranch = User::factory()->create();

    $actor = branchActor(['branches.read'], $organization->id);

    $response = $this->actingAs($actor)->getJson("/api/admin/branches/{$branch->id}/users")->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($inBranch->id)->not->toContain($outsideBranch->id);
});

test('contacts lista los contactos acotados a ESTA sede, solo vínculos activos', function () {
    $organization = Organization::factory()->create();
    $branch = Branch::factory()->create(['organization_id' => $organization->id]);

    $activeContact = Person::factory()->create();
    OrganizationContact::factory()->create([
        'organization_id' => $organization->id, 'branch_id' => $branch->id,
        'contact_id' => $activeContact->id, 'is_active' => true,
    ]);

    $revokedContact = Person::factory()->create();
    OrganizationContact::factory()->create([
        'organization_id' => $organization->id, 'branch_id' => $branch->id,
        'contact_id' => $revokedContact->id, 'is_active' => false,
    ]);

    $otherBranchContact = Person::factory()->create();
    OrganizationContact::factory()->create([
        'organization_id' => $organization->id, 'branch_id' => null,
        'contact_id' => $otherBranchContact->id, 'is_active' => true,
    ]);

    $actor = branchActor(['branches.read'], $organization->id);

    $response = $this->actingAs($actor)->getJson("/api/admin/branches/{$branch->id}/contacts")->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($activeContact->id)
        ->not->toContain($revokedContact->id)
        ->not->toContain($otherBranchContact->id);
});

test('contacts() expone un organization_contact_id no nulo y usable para revoke() (regresión: withPivot() sin "id")', function () {
    $organization = Organization::factory()->create();
    $branch = Branch::factory()->create(['organization_id' => $organization->id]);
    $person = Person::factory()->create();
    $link = OrganizationContact::factory()->create([
        'organization_id' => $organization->id, 'branch_id' => $branch->id,
        'contact_id' => $person->id, 'is_active' => true,
    ]);

    $actor = branchActor(['branches.read', 'contacts.update'], $organization->id);

    $response = $this->actingAs($actor)->getJson("/api/admin/branches/{$branch->id}/contacts")->assertOk();
    $organizationContactId = collect($response->json('data'))->firstWhere('id', $person->id)['organization_contact_id'] ?? null;

    expect($organizationContactId)->not->toBeNull()->toBe($link->id);

    $this->actingAs($actor)
        ->postJson("/api/admin/organizations/{$organization->id}/contacts/{$organizationContactId}/revoke")
        ->assertOk();

    expect($link->fresh()->is_active)->toBeFalse();
});

test('activity exige AMBOS: audit.read Y accesibilidad de la sede, y filtra por metadata->branch_id', function () {
    $organization = Organization::factory()->create();
    $branch = Branch::factory()->create(['organization_id' => $organization->id]);
    $otherBranch = Branch::factory()->create(['organization_id' => $organization->id]);

    $noAuditRead = branchActor(['branches.update', 'branches.activate', 'branches.deactivate'], $organization->id);
    $this->actingAs($noAuditRead)->getJson("/api/admin/branches/{$branch->id}/activity")->assertForbidden();

    $actor = branchActor(['branches.update', 'branches.activate', 'branches.deactivate', 'audit.read'], $organization->id);

    $this->actingAs($actor)->putJson("/api/admin/branches/{$branch->id}", ['name' => 'Actividad Test'])->assertOk();
    $this->actingAs($actor)->postJson("/api/admin/branches/{$branch->id}/deactivate")->assertOk();
    $this->actingAs($actor)->postJson("/api/admin/branches/{$branch->id}/activate")->assertOk();

    // ruido: evento de OTRA sede.
    $this->actingAs($actor)->postJson("/api/admin/branches/{$otherBranch->id}/deactivate")->assertOk();

    $response = $this->actingAs($actor)->getJson("/api/admin/branches/{$branch->id}/activity")->assertOk();

    $events = collect($response->json('data'))->pluck('event_type');
    expect($events)->toContain('BRANCH_UPDATED')
        ->and($events)->toContain('BRANCH_ACTIVATED')
        ->and($events)->toContain('BRANCH_DEACTIVATED')
        ->and($events->count())->toBe(3);
});

// ---- KPIs ----

test('index calcula los KPIs (total/active/inactive/suspended) con la MISMA visibilidad que el listado', function () {
    $organization = Organization::factory()->create();
    $otherOrganization = Organization::factory()->create();

    Branch::factory()->count(2)->create(['organization_id' => $organization->id, 'status' => 'ACTIVE']);
    Branch::factory()->create(['organization_id' => $organization->id, 'status' => 'INACTIVE']);
    Branch::factory()->create(['organization_id' => $organization->id, 'status' => 'SUSPENDED']);
    Branch::factory()->count(5)->create(['organization_id' => $otherOrganization->id, 'status' => 'ACTIVE']);

    $actor = branchActor(['branches.read'], $organization->id);

    $response = $this->actingAs($actor)->getJson('/api/admin/branches')->assertOk();

    expect($response->json('kpis'))->toBe([
        'total' => 4,
        'active' => 2,
        'inactive' => 1,
        'suspended' => 1,
    ]);
});
