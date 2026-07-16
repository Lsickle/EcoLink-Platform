<?php

use App\Models\Branch;
use App\Models\BusinessRole;
use App\Models\Country;
use App\Models\Department;
use App\Models\Municipality;
use App\Models\Organization;
use App\Models\OrganizationBusinessRole;
use App\Models\OrganizationContact;
use App\Models\OrganizationStatus;
use App\Models\Permission;
use App\Models\Person;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\SecurityLog;
use App\Models\User;
use App\Models\UserRole;
use Database\Seeders\OrganizationStatusSeeder;

// CRUD de Organizaciones vs. Figma -- pantalla EXCLUSIVA de platform staff
// (OrganizationController::isPlatformStaff(), sin Policy de modelo, mismo
// criterio que InvitationRequestController).

// `organizations.is_platform_tenant` tiene un índice único parcial (D-CER-04:
// exactamente una fila TRUE en todo el sistema) -- reutiliza la misma
// organización plataforma entre llamadas del mismo test en vez de crear una
// nueva cada vez (violaría esa constraint si un test necesita más de un
// actor platform staff).
function platformTenantId(): int
{
    return Organization::query()->where('is_platform_tenant', true)->value('id')
        ?? Organization::factory()->create(['is_platform_tenant' => true])->id;
}

function organizationTestActor(array $codes = [], ?int $tenantId = null): User
{
    $tenantId ??= platformTenantId();
    $actor = User::factory()->create(['tenant_organization_id' => $tenantId]);

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

function nonPlatformOrgActor(): User
{
    return User::factory()->create();
}

function validOrganizationPayload(array $overrides = []): array
{
    $status = OrganizationStatus::factory()->create();
    $country = Country::query()->firstOrCreate(['iso_code' => 'CO'], ['name' => 'Colombia', 'is_active' => true]);

    return array_merge([
        'legal_name' => 'Acme Ambiental S.A.S.',
        'trade_name' => 'Acme',
        'tax_id' => (string) fake()->unique()->numerify('9########'),
        'tax_id_type' => 'NIT',
        'organization_status_id' => $status->id,
        'timezone' => 'America/Bogota',
        'country_code' => $country->iso_code,
        'currency_code' => 'COP',
    ], $overrides);
}

// ---- Gate: exclusivo de platform staff ----

test('todos los endpoints devuelven 403 para un actor que NO es platform staff', function () {
    $organization = Organization::factory()->create();
    $businessRole = BusinessRole::factory()->create();
    $actor = nonPlatformOrgActor();

    $this->actingAs($actor)->getJson('/api/admin/organizations')->assertForbidden();
    $this->actingAs($actor)->getJson('/api/admin/organizations/search')->assertForbidden();
    $this->actingAs($actor)->postJson('/api/admin/organizations', validOrganizationPayload())->assertForbidden();
    $this->actingAs($actor)->getJson("/api/admin/organizations/{$organization->id}")->assertForbidden();
    $this->actingAs($actor)->putJson("/api/admin/organizations/{$organization->id}", validOrganizationPayload())->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/organizations/{$organization->id}/activate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/organizations/{$organization->id}/deactivate")->assertForbidden();
    $this->actingAs($actor)->getJson("/api/admin/organizations/{$organization->id}/branches")->assertForbidden();
    $this->actingAs($actor)->getJson("/api/admin/organizations/{$organization->id}/contacts")->assertForbidden();
    $this->actingAs($actor)->getJson("/api/admin/organizations/{$organization->id}/users")->assertForbidden();
    $this->actingAs($actor)->getJson("/api/admin/organizations/{$organization->id}/activity")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/organizations/{$organization->id}/business-roles/{$businessRole->id}/assign")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/organizations/{$organization->id}/business-roles/{$businessRole->id}/revoke")->assertForbidden();

    expect(Organization::query()->where('legal_name', 'Acme Ambiental S.A.S.')->exists())->toBeFalse();
});

// ---- index(): filtros, KPIs, type/primary_branch ----

test('index filtra por search (legal_name/trade_name/tax_id)', function () {
    $actor = organizationTestActor();

    $match = Organization::factory()->create(['legal_name' => 'Reciclajes Buscador S.A.S.']);
    $matchByTaxId = Organization::factory()->create(['tax_id' => 'BUSCADOR-900']);
    $noise = Organization::factory()->create(['legal_name' => 'Otra Cosa S.A.S.', 'tax_id' => '111222333']);

    $response = $this->actingAs($actor)->getJson('/api/admin/organizations?search=buscador')->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($match->id)
        ->and($ids)->toContain($matchByTaxId->id)
        ->and($ids)->not->toContain($noise->id);
});

test('index filtra por status (código de organization_statuses)', function () {
    $actor = organizationTestActor();

    $wanted = OrganizationStatus::factory()->create(['code' => 'FILTRO_STATUS_TEST']);
    $other = OrganizationStatus::factory()->create();

    $match = Organization::factory()->create(['organization_status_id' => $wanted->id]);
    $noise = Organization::factory()->create(['organization_status_id' => $other->id]);

    $response = $this->actingAs($actor)->getJson('/api/admin/organizations?status=FILTRO_STATUS_TEST')->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($match->id)->not->toContain($noise->id);
});

test('index filtra por business_role (código, solo asignaciones activas)', function () {
    $actor = organizationTestActor();

    $businessRole = BusinessRole::factory()->create(['code' => 'FILTRO_BR_TEST']);

    $withActiveRole = Organization::factory()->create();
    OrganizationBusinessRole::query()->create([
        'organization_id' => $withActiveRole->id, 'business_role_id' => $businessRole->id, 'is_active' => true, 'assigned_at' => now(),
    ]);

    $withInactiveRole = Organization::factory()->create();
    OrganizationBusinessRole::query()->create([
        'organization_id' => $withInactiveRole->id, 'business_role_id' => $businessRole->id, 'is_active' => false, 'assigned_at' => now(),
    ]);

    $withoutRole = Organization::factory()->create();

    $response = $this->actingAs($actor)->getJson('/api/admin/organizations?business_role=FILTRO_BR_TEST')->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($withActiveRole->id)
        ->and($ids)->not->toContain($withInactiveRole->id)
        ->and($ids)->not->toContain($withoutRole->id);
});

test('index filtra por department/municipality (vía sedes activas)', function () {
    $actor = organizationTestActor();

    $department = Department::factory()->create();
    $municipality = Municipality::factory()->create(['department_id' => $department->id]);

    $match = Organization::factory()->create();
    Branch::factory()->create([
        'organization_id' => $match->id, 'is_active' => true,
        'department_id' => $department->id, 'municipality_id' => $municipality->id,
    ]);

    $noise = Organization::factory()->create();
    Branch::factory()->create(['organization_id' => $noise->id, 'is_active' => true]);

    $byDepartment = $this->actingAs($actor)->getJson("/api/admin/organizations?department={$department->id}")->assertOk();
    $byMunicipality = $this->actingAs($actor)->getJson("/api/admin/organizations?municipality={$municipality->id}")->assertOk();

    expect(collect($byDepartment->json('data'))->pluck('id'))->toContain($match->id)->not->toContain($noise->id);
    expect(collect($byMunicipality->json('data'))->pluck('id'))->toContain($match->id)->not->toContain($noise->id);
});

test('index expone type (business_roles activos) y primary_branch (sede activa de menor id)', function () {
    $actor = organizationTestActor();

    $businessRole = BusinessRole::factory()->create(['name' => 'Gestor de Prueba']);
    $organization = Organization::factory()->create();
    OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id, 'business_role_id' => $businessRole->id, 'is_active' => true, 'assigned_at' => now(),
    ]);

    $department = Department::factory()->create();
    $municipality = Municipality::factory()->create(['department_id' => $department->id, 'name' => 'Municipio Principal']);

    $oldestBranch = Branch::factory()->create([
        'organization_id' => $organization->id, 'is_active' => true,
        'department_id' => $department->id, 'municipality_id' => $municipality->id,
    ]);
    Branch::factory()->create(['organization_id' => $organization->id, 'is_active' => true]);

    $response = $this->actingAs($actor)->getJson('/api/admin/organizations')->assertOk();

    $row = collect($response->json('data'))->firstWhere('id', $organization->id);
    expect($row['type'])->toBe(['Gestor de Prueba'])
        ->and($row['primary_branch']['municipality']['name'])->toBe('Municipio Principal')
        ->and($row['primary_branch']['department']['id'])->toBe($department->id);
});

test('index calcula los KPIs con las 5 organization_statuses reales (una fila por cada una, aunque tengan 0 organizaciones)', function () {
    $this->seed(OrganizationStatusSeeder::class);

    $active = OrganizationStatus::query()->where('code', 'ACT')->firstOrFail();
    $prospect = OrganizationStatus::query()->where('code', 'PRO')->firstOrFail();

    $platform = Organization::factory()->create(['is_platform_tenant' => true, 'organization_status_id' => $active->id]);
    $actor = organizationTestActor(tenantId: $platform->id);

    Organization::factory()->count(2)->create(['organization_status_id' => $active->id]);
    Organization::factory()->create(['organization_status_id' => $prospect->id]);

    $response = $this->actingAs($actor)->getJson('/api/admin/organizations')->assertOk();

    $kpis = collect($response->json('kpis'))->keyBy('code');
    expect($kpis)->toHaveCount(5)
        // +1 en ACT por la propia organización plataforma del actor.
        ->and($kpis['ACT']['count'])->toBe(3)
        ->and($kpis['PRO']['count'])->toBe(1)
        ->and($kpis['SUS']['count'])->toBe(0)
        ->and($kpis['INA']['count'])->toBe(0)
        ->and($kpis['BLO']['count'])->toBe(0);
});

// ---- show() ----

test('show carga status/businessRoles activos/createdBy y los 3 conteos', function () {
    $actor = organizationTestActor();
    $creator = User::factory()->create(['username' => 'creador_org_test']);
    $organization = Organization::factory()->create(['created_by' => $creator->id]);

    $activeRole = BusinessRole::factory()->create(['name' => 'Rol Activo']);
    OrganizationBusinessRole::query()->create(['organization_id' => $organization->id, 'business_role_id' => $activeRole->id, 'is_active' => true, 'assigned_at' => now()]);
    $inactiveRole = BusinessRole::factory()->create(['name' => 'Rol Inactivo']);
    OrganizationBusinessRole::query()->create(['organization_id' => $organization->id, 'business_role_id' => $inactiveRole->id, 'is_active' => false, 'assigned_at' => now()]);

    Branch::factory()->count(2)->create(['organization_id' => $organization->id, 'is_active' => true]);
    Branch::factory()->create(['organization_id' => $organization->id, 'is_active' => false]);
    // D-P02 / L-08: `contacts_count` cuenta vínculos ACTIVOS del pivote
    // `organization_contacts`, no `Person.is_active` (relación vieja
    // reemplazada, ver Organization::contacts()).
    OrganizationContact::factory()->count(3)->create(['organization_id' => $organization->id, 'is_active' => true]);
    OrganizationContact::factory()->create(['organization_id' => $organization->id, 'is_active' => false]);

    $response = $this->actingAs($actor)->getJson("/api/admin/organizations/{$organization->id}")->assertOk();

    $response->assertJsonPath('organization.type', ['Rol Activo'])
        ->assertJsonPath('organization.created_by.id', $creator->id)
        ->assertJsonPath('organization.created_by.username', 'creador_org_test')
        ->assertJsonPath('organization.branches_count', 2)
        ->assertJsonPath('organization.contacts_count', 3)
        ->assertJsonPath('organization.users_count', 0);
});

// ---- store() ----

test('store crea la organización, valida catálogos fijos y business_role_ids', function () {
    $actor = organizationTestActor();
    $businessRole = BusinessRole::factory()->create();

    $response = $this->actingAs($actor)->postJson('/api/admin/organizations', validOrganizationPayload([
        'business_role_ids' => [$businessRole->id],
    ]))->assertCreated();

    $organization = Organization::query()->where('legal_name', 'Acme Ambiental S.A.S.')->firstOrFail();
    expect($organization->created_by)->toBe($actor->id)
        ->and($organization->updated_by)->toBe($actor->id)
        ->and($organization->is_active)->toBeTrue()
        ->and($organization->risk_level)->toBe('bajo');

    expect(OrganizationBusinessRole::query()
        ->where('organization_id', $organization->id)
        ->where('business_role_id', $businessRole->id)
        ->where('is_active', true)
        ->exists())->toBeTrue();

    $log = SecurityLog::query()->where('event_type', 'ORGANIZATION_CREATED')->first();
    expect($log)->not->toBeNull()->and($log->metadata['organization_id'])->toBe($organization->id);

    $response->assertJsonPath('organization.legal_name', 'Acme Ambiental S.A.S.');
});

test('store rechaza tax_id_type fuera de la lista fija (422)', function () {
    $actor = organizationTestActor();

    $this->actingAs($actor)->postJson('/api/admin/organizations', validOrganizationPayload(['tax_id_type' => 'RUT']))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('tax_id_type');
});

test('store rechaza timezone/currency_code/company_size/risk_level fuera de las listas fijas (422)', function () {
    $actor = organizationTestActor();

    $this->actingAs($actor)->postJson('/api/admin/organizations', validOrganizationPayload(['timezone' => 'Europe/Madrid']))
        ->assertUnprocessable()->assertJsonValidationErrors('timezone');

    $this->actingAs($actor)->postJson('/api/admin/organizations', validOrganizationPayload(['currency_code' => 'MXN']))
        ->assertUnprocessable()->assertJsonValidationErrors('currency_code');

    $this->actingAs($actor)->postJson('/api/admin/organizations', validOrganizationPayload(['company_size' => 'Gigante']))
        ->assertUnprocessable()->assertJsonValidationErrors('company_size');

    $this->actingAs($actor)->postJson('/api/admin/organizations', validOrganizationPayload(['risk_level' => 'extremo']))
        ->assertUnprocessable()->assertJsonValidationErrors('risk_level');
});

test('store rechaza tax_id duplicado para el mismo tax_id_type (422) -- validación de aplicación (esquema-bd, hueco: sin unique compuesto real en BD)', function () {
    $actor = organizationTestActor();

    $this->actingAs($actor)->postJson('/api/admin/organizations', validOrganizationPayload(['tax_id' => '900555666', 'tax_id_type' => 'NIT']))
        ->assertCreated();

    $this->actingAs($actor)->postJson('/api/admin/organizations', validOrganizationPayload(['legal_name' => 'Otra Empresa S.A.S.', 'tax_id' => '900555666', 'tax_id_type' => 'NIT']))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('tax_id');

    // mismo tax_id, tax_id_type DISTINTO -- no colisiona (unicidad compuesta).
    $this->actingAs($actor)->postJson('/api/admin/organizations', validOrganizationPayload(['legal_name' => 'Tercera Empresa S.A.S.', 'tax_id' => '900555666', 'tax_id_type' => 'CC']))
        ->assertCreated();
});

test('store permite reutilizar el tax_id de una organización soft-eliminada (especialista-seguridad, 2026-07-15)', function () {
    $actor = organizationTestActor();

    $deleted = Organization::factory()->create(['tax_id' => '900777888', 'tax_id_type' => 'NIT']);
    $deleted->delete();

    $this->actingAs($actor)->postJson('/api/admin/organizations', validOrganizationPayload(['tax_id' => '900777888', 'tax_id_type' => 'NIT']))
        ->assertCreated();
});

test('store rechaza parent_organization_id inexistente (422)', function () {
    $actor = organizationTestActor();

    $this->actingAs($actor)->postJson('/api/admin/organizations', validOrganizationPayload(['parent_organization_id' => 999999]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('parent_organization_id');
});

// ---- update() ----

test('update ignora cambios a tax_id/tax_id_type (no editables tras creación)', function () {
    $actor = organizationTestActor();
    $organization = Organization::factory()->create(['tax_id' => '900000111', 'tax_id_type' => 'NIT']);

    $this->actingAs($actor)->putJson("/api/admin/organizations/{$organization->id}", validOrganizationPayload([
        'legal_name' => 'Nombre Actualizado S.A.S.',
        'tax_id' => '900999888',
        'tax_id_type' => 'CC',
    ]))->assertOk()->assertJsonPath('organization.legal_name', 'Nombre Actualizado S.A.S.');

    $organization->refresh();
    expect($organization->tax_id)->toBe('900000111')
        ->and($organization->tax_id_type)->toBe('NIT')
        ->and($organization->legal_name)->toBe('Nombre Actualizado S.A.S.')
        ->and($organization->updated_by)->toBe($actor->id);

    expect(SecurityLog::query()->where('event_type', 'ORGANIZATION_UPDATED')->where('metadata->organization_id', $organization->id)->exists())->toBeTrue();
});

test('update rechaza parent_organization_id apuntando a sí misma (auto-referencia, 422)', function () {
    $actor = organizationTestActor();
    $organization = Organization::factory()->create();

    $this->actingAs($actor)->putJson("/api/admin/organizations/{$organization->id}", validOrganizationPayload([
        'parent_organization_id' => $organization->id,
    ]))->assertUnprocessable()->assertJsonValidationErrors('parent_organization_id');
});

test('update rechaza un ciclo INDIRECTO en parent_organization_id (A matriz de B, B matriz de A, 422) -- especialista-seguridad, 2026-07-15', function () {
    $actor = organizationTestActor();

    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create(['parent_organization_id' => $orgA->id]);

    // Intentar que A tenga a B como matriz cerraría el ciclo A->B->A.
    $this->actingAs($actor)->putJson("/api/admin/organizations/{$orgA->id}", validOrganizationPayload([
        'parent_organization_id' => $orgB->id,
    ]))->assertUnprocessable()->assertJsonValidationErrors('parent_organization_id');

    $orgA->refresh();
    expect($orgA->parent_organization_id)->toBeNull();
});

test('update sincroniza business_role_ids cuando vienen en el payload', function () {
    $actor = organizationTestActor();
    $organization = Organization::factory()->create();
    $businessRole = BusinessRole::factory()->create();

    $this->actingAs($actor)->putJson("/api/admin/organizations/{$organization->id}", validOrganizationPayload([
        'business_role_ids' => [$businessRole->id],
    ]))->assertOk();

    expect(OrganizationBusinessRole::query()
        ->where('organization_id', $organization->id)
        ->where('business_role_id', $businessRole->id)
        ->where('is_active', true)
        ->exists())->toBeTrue();
});

// ---- activate()/deactivate() ----

test('activate/deactivate togglean is_active y registran auditoría', function () {
    $actor = organizationTestActor();
    $organization = Organization::factory()->create(['is_active' => true]);

    $this->actingAs($actor)->postJson("/api/admin/organizations/{$organization->id}/deactivate")->assertOk();
    expect($organization->fresh()->is_active)->toBeFalse();

    $this->actingAs($actor)->postJson("/api/admin/organizations/{$organization->id}/activate")->assertOk();
    expect($organization->fresh()->is_active)->toBeTrue();

    expect(SecurityLog::query()->where('event_type', 'ORGANIZATION_DEACTIVATED')->exists())->toBeTrue()
        ->and(SecurityLog::query()->where('event_type', 'ORGANIZATION_ACTIVATED')->exists())->toBeTrue();
});

// ---- branches()/users()/activity() ----
// (los tests de contacts()/storeContact()/updateContact()/revokeContact()/
// searchContacts() -- D-P02 / L-08 -- viven en
// tests/Feature/Admin/OrganizationContactControllerTest.php)

test('branches lista las sedes de la organización con branchType cargado', function () {
    $actor = organizationTestActor();
    $organization = Organization::factory()->create();
    $branch = Branch::factory()->create(['organization_id' => $organization->id]);
    $noise = Branch::factory()->create();

    $response = $this->actingAs($actor)->getJson("/api/admin/organizations/{$organization->id}/branches")->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($branch->id)->not->toContain($noise->id);

    $row = collect($response->json('data'))->firstWhere('id', $branch->id);
    expect($row)->toHaveKey('branch_type');
});

test('users lista los usuarios cuyo tenant_organization_id es la organización', function () {
    $actor = organizationTestActor();
    $organization = Organization::factory()->create();

    $inTenant = User::factory()->create(['tenant_organization_id' => $organization->id]);
    $outsideTenant = User::factory()->create();

    $response = $this->actingAs($actor)->getJson("/api/admin/organizations/{$organization->id}/users")->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($inTenant->id)->not->toContain($outsideTenant->id);
});

test('activity exige AMBOS: platform staff Y audit.read, y filtra por metadata->organization_id', function () {
    $organization = Organization::factory()->create();
    $businessRole = BusinessRole::factory()->create();

    // platform staff pero SIN audit.read -> 403.
    $noAuditRead = organizationTestActor();
    $this->actingAs($noAuditRead)->getJson("/api/admin/organizations/{$organization->id}/activity")->assertForbidden();

    $actor = organizationTestActor(['audit.read']);

    $this->actingAs($actor)->putJson("/api/admin/organizations/{$organization->id}", validOrganizationPayload())->assertOk();
    $this->actingAs($actor)->postJson("/api/admin/organizations/{$organization->id}/deactivate")->assertOk();
    $this->actingAs($actor)->postJson("/api/admin/organizations/{$organization->id}/activate")->assertOk();
    $this->actingAs($actor)->postJson("/api/admin/organizations/{$organization->id}/business-roles/{$businessRole->id}/assign")->assertOk();
    $this->actingAs($actor)->postJson("/api/admin/organizations/{$organization->id}/business-roles/{$businessRole->id}/revoke")->assertOk();

    // ruido: evento de OTRA organización.
    $other = Organization::factory()->create();
    $this->actingAs($actor)->postJson("/api/admin/organizations/{$other->id}/deactivate")->assertOk();

    $response = $this->actingAs($actor)->getJson("/api/admin/organizations/{$organization->id}/activity")->assertOk();

    $events = collect($response->json('data'))->pluck('event_type');
    expect($events)->toContain('ORGANIZATION_UPDATED')
        ->and($events)->toContain('ORGANIZATION_DEACTIVATED')
        ->and($events)->toContain('ORGANIZATION_ACTIVATED')
        ->and($events)->toContain('BUSINESS_ROLE_ASSIGNED')
        ->and($events)->toContain('BUSINESS_ROLE_REVOKED')
        ->and(collect($response->json('data'))->pluck('description'))
        ->each(fn ($description) => expect($description)->not->toBeNull());
});

// ---- assignBusinessRole()/revokeBusinessRole() ----

test('assignBusinessRole/revokeBusinessRole son idempotentes y registran auditoría', function () {
    $actor = organizationTestActor();
    $organization = Organization::factory()->create();
    $businessRole = BusinessRole::factory()->create();

    $this->actingAs($actor)->postJson("/api/admin/organizations/{$organization->id}/business-roles/{$businessRole->id}/assign")->assertOk();
    $this->actingAs($actor)->postJson("/api/admin/organizations/{$organization->id}/business-roles/{$businessRole->id}/assign")->assertOk();

    expect(OrganizationBusinessRole::query()->where('organization_id', $organization->id)->where('business_role_id', $businessRole->id)->count())->toBe(1)
        ->and(OrganizationBusinessRole::query()->where('organization_id', $organization->id)->where('business_role_id', $businessRole->id)->first()->is_active)->toBeTrue();

    $this->actingAs($actor)->postJson("/api/admin/organizations/{$organization->id}/business-roles/{$businessRole->id}/revoke")->assertOk();
    $this->actingAs($actor)->postJson("/api/admin/organizations/{$organization->id}/business-roles/{$businessRole->id}/revoke")->assertOk();

    expect(OrganizationBusinessRole::query()->where('organization_id', $organization->id)->where('business_role_id', $businessRole->id)->count())->toBe(1)
        ->and(OrganizationBusinessRole::query()->where('organization_id', $organization->id)->where('business_role_id', $businessRole->id)->first()->is_active)->toBeFalse();

    expect(SecurityLog::query()->where('event_type', 'BUSINESS_ROLE_ASSIGNED')->where('metadata->business_role_id', $businessRole->id)->exists())->toBeTrue()
        ->and(SecurityLog::query()->where('event_type', 'BUSINESS_ROLE_REVOKED')->where('metadata->business_role_id', $businessRole->id)->exists())->toBeTrue();
});

// ---- search() ----

test('search excluye exclude_id y devuelve solo {id, legal_name, tax_id}', function () {
    $actor = organizationTestActor();

    $match = Organization::factory()->create(['legal_name' => 'Matriz Buscador S.A.S.']);
    $excluded = Organization::factory()->create(['legal_name' => 'Matriz Buscador Excluida S.A.S.']);

    $response = $this->actingAs($actor)
        ->getJson('/api/admin/organizations/search?q=Buscador&exclude_id='.$excluded->id)
        ->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($match->id)->not->toContain($excluded->id);

    $row = collect($response->json('data'))->first();
    expect(array_keys($row))->toBe(['id', 'legal_name', 'tax_id']);
});
