<?php

use App\Models\BusinessRole;
use App\Models\Organization;
use App\Models\OrganizationBusinessRole;
use App\Models\Person;
use App\Models\Role;
use App\Models\TransportPersonnel;
use App\Models\User;
use App\Models\UserRole;
use Database\Seeders\BusinessRoleSeeder;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\PlatformOrganizationSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;

// CRUD de Conductores (`transport_personnel`, CU-030/D-PRG-03/D-PRG-04) --
// gap real de contrato detectado por el agente de frontend, mismo patrón de
// fixtures que TransportScheduleControllerTest (prefijo `tp`). A diferencia
// de `tsActor()` (que solo asigna LOGÍSTICA, dueño de TODO el permiso
// `transport_schedules.*`), aquí se necesita elegir el ROL real según lo que
// se prueba: `transport_personnel.create`/`.update` SOLO están en
// ADMINISTRADOR (LOGÍSTICA es de solo lectura, mismo criterio que
// `vehicles.read`) -- ver RolePermissionSeeder.
beforeEach(function () {
    $this->seed(OrganizationStatusSeeder::class);
    $this->seed(PlatformOrganizationSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->seed(PermissionSeeder::class);
    $this->seed(RolePermissionSeeder::class);
    $this->seed(BusinessRoleSeeder::class);
});

function tpActor(?string $roleCode = null, ?int $tenantOrganizationId = null): User
{
    $actor = User::factory()->create(['tenant_organization_id' => $tenantOrganizationId]);

    if ($roleCode !== null) {
        $role = Role::query()->where('code', $roleCode)->firstOrFail();

        UserRole::query()->create(['user_id' => $actor->id, 'role_id' => $role->id, 'is_active' => true]);
    }

    return $actor;
}

function tpAdminActor(?int $tenantOrganizationId = null): User
{
    return tpActor('ADMINISTRADOR', $tenantOrganizationId);
}

function tpLogisticaActor(?int $tenantOrganizationId = null): User
{
    return tpActor('LOGÍSTICA', $tenantOrganizationId);
}

function tpPlatformStaffActor(): User
{
    $platform = Organization::query()->where('is_platform_tenant', true)->first()
        ?? Organization::factory()->create(['is_platform_tenant' => true]);

    return tpAdminActor($platform->id);
}

function tpGestorOrganization(): Organization
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

// ---- store(): creación válida + anti-IDOR ----

test('store crea un conductor en la organización actora', function () {
    $gestor = tpGestorOrganization();
    $person = Person::factory()->create(['organization_id' => $gestor->id]);
    $actor = tpAdminActor($gestor->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/transport-personnel', [
        'person_id' => $person->id,
        'license_number' => 'LIC-12345678',
        'license_category' => 'C2',
        'license_expiration_date' => now()->addYear()->toDateString(),
        'has_hazmat_permit' => true,
    ])->assertCreated();

    $response->assertJsonPath('transport_personnel.organization_id', $gestor->id)
        ->assertJsonPath('transport_personnel.person_id', $person->id)
        ->assertJsonPath('transport_personnel.is_active', true);

    expect(TransportPersonnel::query()->where('person_id', $person->id)->exists())->toBeTrue();
});

test('store rechaza cuando la organización actora NO tiene la capacidad can_transport_waste', function () {
    $generator = Organization::factory()->create();
    $generatorRole = BusinessRole::query()->where('code', 'GENERATOR')->firstOrFail();
    OrganizationBusinessRole::query()->create([
        'organization_id' => $generator->id,
        'business_role_id' => $generatorRole->id,
        'assigned_at' => now(),
        'is_active' => true,
    ]);

    $person = Person::factory()->create(['organization_id' => $generator->id]);
    $actor = tpAdminActor($generator->id);

    $this->actingAs($actor)->postJson('/api/admin/transport-personnel', [
        'person_id' => $person->id,
    ])->assertForbidden();

    expect(TransportPersonnel::query()->count())->toBe(0);
});

test('store rechaza un person_id que pertenece a OTRA organización (anti-IDOR)', function () {
    $gestor = tpGestorOrganization();
    $otherOrganization = Organization::factory()->create();
    $foreignPerson = Person::factory()->create(['organization_id' => $otherOrganization->id]);
    $actor = tpAdminActor($gestor->id);

    $this->actingAs($actor)->postJson('/api/admin/transport-personnel', [
        'person_id' => $foreignPerson->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('person_id');

    expect(TransportPersonnel::query()->count())->toBe(0);
});

test('store rechaza un person_id ya registrado como conductor (unicidad 1:1)', function () {
    $gestor = tpGestorOrganization();
    $person = Person::factory()->create(['organization_id' => $gestor->id]);
    TransportPersonnel::factory()->create(['organization_id' => $gestor->id, 'person_id' => $person->id]);
    $actor = tpAdminActor($gestor->id);

    $this->actingAs($actor)->postJson('/api/admin/transport-personnel', [
        'person_id' => $person->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('person_id');

    expect(TransportPersonnel::query()->count())->toBe(1);
});

test('platform staff puede crear un conductor especificando organization_id', function () {
    $gestor = tpGestorOrganization();
    $person = Person::factory()->create(['organization_id' => $gestor->id]);
    $actor = tpPlatformStaffActor();

    $response = $this->actingAs($actor)->postJson('/api/admin/transport-personnel', [
        'organization_id' => $gestor->id,
        'person_id' => $person->id,
    ])->assertCreated();

    $response->assertJsonPath('transport_personnel.organization_id', $gestor->id);
});

// ---- index()/show(): aislamiento tenant-vs-platform-staff (incluye LOGÍSTICA solo lectura) ----

test('index(): una organización ve SOLO sus propios conductores; platform staff ve todos', function () {
    $gestorA = tpGestorOrganization();
    $personnelA = TransportPersonnel::factory()->create(['organization_id' => $gestorA->id]);

    $gestorB = tpGestorOrganization();
    TransportPersonnel::factory()->create(['organization_id' => $gestorB->id]);

    $actorA = tpLogisticaActor($gestorA->id);
    $viewA = $this->actingAs($actorA)->getJson('/api/admin/transport-personnel')->assertOk();
    expect($viewA->json('total'))->toBe(1)
        ->and(collect($viewA->json('data'))->pluck('id'))->toContain($personnelA->id);

    $platformActor = tpPlatformStaffActor();
    $allView = $this->actingAs($platformActor)->getJson('/api/admin/transport-personnel')->assertOk();
    expect($allView->json('total'))->toBe(2);
});

test('show(): una organización ajena recibe 403 (IDOR)', function () {
    $gestor = tpGestorOrganization();
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $gestor->id]);

    $foreignOrganization = tpGestorOrganization();
    $foreignActor = tpLogisticaActor($foreignOrganization->id);

    $this->actingAs($foreignActor)
        ->getJson("/api/admin/transport-personnel/{$personnel->id}")
        ->assertForbidden();
});

test('LOGÍSTICA (solo lectura) NO puede crear ni editar conductores', function () {
    $gestor = tpGestorOrganization();
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $gestor->id]);
    $person = Person::factory()->create(['organization_id' => $gestor->id]);
    $actor = tpLogisticaActor($gestor->id);

    $this->actingAs($actor)->getJson("/api/admin/transport-personnel/{$personnel->id}")->assertOk();
    $this->actingAs($actor)->postJson('/api/admin/transport-personnel', ['person_id' => $person->id])->assertForbidden();
    $this->actingAs($actor)->putJson("/api/admin/transport-personnel/{$personnel->id}", ['license_category' => 'B2'])->assertForbidden();
});

test('todos los endpoints devuelven 403 sin ningún rol/permiso transport_personnel.* asignado', function () {
    $gestor = tpGestorOrganization();
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $gestor->id]);
    $actor = tpActor(null, $gestor->id);

    $this->actingAs($actor)->getJson('/api/admin/transport-personnel')->assertForbidden();
    $this->actingAs($actor)->postJson('/api/admin/transport-personnel', [])->assertForbidden();
    $this->actingAs($actor)->getJson("/api/admin/transport-personnel/{$personnel->id}")->assertForbidden();
    $this->actingAs($actor)->putJson("/api/admin/transport-personnel/{$personnel->id}", [])->assertForbidden();
});

// ---- update(): edición + is_active gestionado vía .update (sin .activate/.deactivate) ----

test('update() modifica campos propios y permite togglear is_active bajo el único permiso .update', function () {
    $gestor = tpGestorOrganization();
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $gestor->id, 'is_active' => true]);
    $actor = tpAdminActor($gestor->id);

    $this->actingAs($actor)->putJson("/api/admin/transport-personnel/{$personnel->id}", [
        'license_category' => 'C3',
        'is_active' => false,
    ])->assertOk()
        ->assertJsonPath('transport_personnel.license_category', 'C3')
        ->assertJsonPath('transport_personnel.is_active', false);
});

test('update() ignora organization_id/person_id en el payload', function () {
    $gestor = tpGestorOrganization();
    $otherOrganization = Organization::factory()->create();
    $originalPerson = Person::factory()->create(['organization_id' => $gestor->id]);
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $gestor->id, 'person_id' => $originalPerson->id]);
    $actor = tpAdminActor($gestor->id);

    $otherPerson = Person::factory()->create(['organization_id' => $otherOrganization->id]);

    $this->actingAs($actor)->putJson("/api/admin/transport-personnel/{$personnel->id}", [
        'organization_id' => $otherOrganization->id,
        'person_id' => $otherPerson->id,
        'license_category' => 'B2',
    ])->assertOk();

    $personnel->refresh();
    expect($personnel->organization_id)->toBe($gestor->id)
        ->and($personnel->person_id)->toBe($originalPerson->id)
        ->and($personnel->license_category)->toBe('B2');
});

test('update() rechaza un conductor de OTRA organización (IDOR)', function () {
    $gestor = tpGestorOrganization();
    $foreignOrganization = tpGestorOrganization();
    $foreignPersonnel = TransportPersonnel::factory()->create(['organization_id' => $foreignOrganization->id]);
    $actor = tpAdminActor($gestor->id);

    $this->actingAs($actor)->putJson("/api/admin/transport-personnel/{$foreignPersonnel->id}", [
        'license_category' => 'B2',
    ])->assertForbidden();
});
