<?php

use App\Models\Organization;
use App\Models\OrganizationalArea;
use App\Models\OrganizationContact;
use App\Models\Permission;
use App\Models\Person;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserRole;

// CORREGIDO (verificación E2E, 2026-07-20): assertPersonBelongsToOrganization()
// pasó a validar pertenencia vía el pivote real `organization_contacts` (antes
// usaba la columna legacy `people.organization_id`, que queda NULL para todo
// contacto creado por el flujo vigente -- bug real reproducido en vivo, mismo
// patrón ya corregido en TransportPersonnelController/ManifestLoadController/
// ManifestUnloadController). Este helper crea el vínculo real en vez de solo
// setear Person.organization_id.
function oaPersonInOrganization(int $organizationId): Person
{
    $person = Person::factory()->create(['organization_id' => $organizationId]);

    OrganizationContact::factory()->create([
        'contact_id' => $person->id,
        'organization_id' => $organizationId,
        'is_active' => true,
    ]);

    return $person;
}

// Catálogo Maestro "Áreas Organizacionales" (Batch 1/3) -- gateado por
// OrganizationalAreaPolicy -> User::hasPermission()
// ('organizational_areas.read'/'organizational_areas.manage'). A diferencia
// de los 5 catálogos hermanos de este lote, cada fila pertenece a UNA
// organización concreta (`organization_id` NOT NULL) -- criterio de
// aislamiento señalado como AVISO explícito al hilo principal (ver
// docblock de OrganizationalAreaController), cubierto aquí.

function actorWithOrganizationalAreaPermission(array $codes, ?int $tenantId = null): User
{
    $actor = User::factory()->create(['tenant_organization_id' => $tenantId]);
    $grantRole = Role::factory()->create();

    foreach ($codes as $code) {
        $permission = Permission::query()->firstOrCreate(['code' => $code], [
            'name' => $code, 'module' => explode('.', $code)[0], 'action' => explode('.', $code)[1] ?? $code,
            'scope' => 'tenant', 'is_system' => true, 'is_active' => true,
        ]);
        RolePermission::query()->create(['role_id' => $grantRole->id, 'permission_id' => $permission->id, 'is_active' => true]);
    }

    UserRole::query()->create(['user_id' => $actor->id, 'role_id' => $grantRole->id, 'is_active' => true]);

    return $actor;
}

function platformOrgActorForOrganizationalArea(array $codes): User
{
    $platform = Organization::factory()->create(['is_platform_tenant' => true]);

    return actorWithOrganizationalAreaPermission($codes, $platform->id);
}

// ---- index() ----

test('index respeta organizational_areas.read', function () {
    $org = Organization::factory()->create();
    OrganizationalArea::factory()->create(['organization_id' => $org->id]);

    $noPermission = User::factory()->create(['tenant_organization_id' => $org->id]);
    $this->actingAs($noPermission)->getJson('/api/admin/organizational-areas')->assertForbidden();

    $reader = actorWithOrganizationalAreaPermission(['organizational_areas.read'], $org->id);
    $this->actingAs($reader)->getJson('/api/admin/organizational-areas')->assertOk();
});

test('index aisla cross-tenant: un actor normal SOLO ve las áreas de su propia organización', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $ownArea = OrganizationalArea::factory()->create(['organization_id' => $orgA->id, 'code' => 'AREA_A']);
    $otherArea = OrganizationalArea::factory()->create(['organization_id' => $orgB->id, 'code' => 'AREA_B']);

    $actor = actorWithOrganizationalAreaPermission(['organizational_areas.read'], $orgA->id);

    // Aunque el actor pida explícitamente organization_id=orgB, el filtro
    // real se fuerza SIEMPRE a su propio tenant (mismo criterio que
    // store() -- nunca se confía en el input del cliente).
    $response = $this->actingAs($actor)->getJson("/api/admin/organizational-areas?organization_id={$orgB->id}")->assertOk();

    $codes = collect($response->json('data'))->pluck('code');
    expect($codes)->toContain($ownArea->code)->not->toContain($otherArea->code);
});

// Bug reportado por el usuario (2026-07-18): antes `organization_id` era
// OBLIGATORIO para isPlatformStaff() -- el admin de EcoLink no podía ver
// TODAS las áreas sin elegir una organización primero. Corregido:
// `organization_id` es un filtro OPCIONAL, sin él ve áreas de TODAS las
// organizaciones.
test('index NO exige organization_id para isPlatformStaff(): sin filtro ve áreas de TODAS las organizaciones', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $areaA = OrganizationalArea::factory()->create(['organization_id' => $orgA->id]);
    $areaB = OrganizationalArea::factory()->create(['organization_id' => $orgB->id]);

    $actor = platformOrgActorForOrganizationalArea(['organizational_areas.read']);

    $response = $this->actingAs($actor)->getJson('/api/admin/organizational-areas')->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($areaA->id)->toContain($areaB->id);
});

test('index: sin filtro de organización, cada área trae su organización eager-cargada', function () {
    $orgA = Organization::factory()->create(['legal_name' => 'Organización A S.A.S.']);
    OrganizationalArea::factory()->create(['organization_id' => $orgA->id]);

    $actor = platformOrgActorForOrganizationalArea(['organizational_areas.read']);

    $response = $this->actingAs($actor)->getJson('/api/admin/organizational-areas')->assertOk();

    $data = collect($response->json('data'));
    expect($data)->not->toBeEmpty();

    foreach ($data as $row) {
        expect($row['organization'])->not->toBeNull();
        expect($row['organization'])->toHaveKey('legal_name');
    }
});

test('index permite a isPlatformStaff() ver áreas de CUALQUIER organización vía organization_id', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $areaA = OrganizationalArea::factory()->create(['organization_id' => $orgA->id]);
    $areaB = OrganizationalArea::factory()->create(['organization_id' => $orgB->id]);

    $actor = platformOrgActorForOrganizationalArea(['organizational_areas.read']);

    $responseA = $this->actingAs($actor)->getJson("/api/admin/organizational-areas?organization_id={$orgA->id}")->assertOk();
    expect(collect($responseA->json('data'))->pluck('id'))->toContain($areaA->id)->not->toContain($areaB->id);

    $responseB = $this->actingAs($actor)->getJson("/api/admin/organizational-areas?organization_id={$orgB->id}")->assertOk();
    expect(collect($responseB->json('data'))->pluck('id'))->toContain($areaB->id)->not->toContain($areaA->id);
});

// ---- show() ----

test('view/update DENIEGAN (403) sobre un área de OTRA organización', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $otherArea = OrganizationalArea::factory()->create(['organization_id' => $orgB->id]);

    $reader = actorWithOrganizationalAreaPermission(['organizational_areas.read'], $orgA->id);
    $this->actingAs($reader)->getJson("/api/admin/organizational-areas/{$otherArea->id}")->assertForbidden();

    $editor = actorWithOrganizationalAreaPermission(['organizational_areas.manage'], $orgA->id);
    $this->actingAs($editor)->putJson("/api/admin/organizational-areas/{$otherArea->id}", ['name' => 'Hackeado'])->assertForbidden();
});

// ---- store() ----

test('store crea un área nueva y fija organization_id del actor, nunca del input del cliente', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();
    $actor = actorWithOrganizationalAreaPermission(['organizational_areas.manage'], $orgA->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/organizational-areas', [
        'organization_id' => $orgB->id,
        'code' => 'AREA_NEW',
        'name' => 'Gerencia General',
        'level' => 'Gerencia',
    ])->assertCreated();

    $area = OrganizationalArea::query()->where('code', 'AREA_NEW')->firstOrFail();
    expect($area->organization_id)->toBe($orgA->id);
});

test('store sin organizational_areas.manage devuelve 403', function () {
    $org = Organization::factory()->create();
    $actor = User::factory()->create(['tenant_organization_id' => $org->id]);

    $this->actingAs($actor)->postJson('/api/admin/organizational-areas', [
        'code' => 'X', 'name' => 'X', 'level' => 'Dirección',
    ])->assertForbidden();
});

test('store exige organization_id para isPlatformStaff()', function () {
    $actor = platformOrgActorForOrganizationalArea(['organizational_areas.manage']);

    $this->actingAs($actor)->postJson('/api/admin/organizational-areas', [
        'code' => 'X', 'name' => 'X', 'level' => 'Dirección',
    ])->assertUnprocessable()->assertJsonValidationErrors('organization_id');
});

test('store rechaza un parent_area_id de OTRA organización', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $parentInOtherOrg = OrganizationalArea::factory()->create(['organization_id' => $orgB->id]);
    $actor = actorWithOrganizationalAreaPermission(['organizational_areas.manage'], $orgA->id);

    $this->actingAs($actor)->postJson('/api/admin/organizational-areas', [
        'code' => 'CHILD', 'name' => 'Área hija', 'level' => 'Coordinación',
        'parent_area_id' => $parentInOtherOrg->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('parent_area_id');
});

// Hallazgo Alto (revisión de especialista-seguridad): responsible_person_id
// solo se validaba con exists:people,id, sin comparar organización -- un
// actor de la Organización A podía asignar como responsable a una persona
// de la Organización B (o sin organización), adivinando/enumerando un
// people.id válido. Mismo patrón de fix que parent_area_id.
test('store rechaza un responsible_person_id de OTRA organización', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $personInOtherOrg = oaPersonInOrganization($orgB->id);
    $actor = actorWithOrganizationalAreaPermission(['organizational_areas.manage'], $orgA->id);

    $this->actingAs($actor)->postJson('/api/admin/organizational-areas', [
        'code' => 'AREA_X', 'name' => 'Área X', 'level' => 'Coordinación',
        'responsible_person_id' => $personInOtherOrg->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('responsible_person_id');
});

test('store acepta un responsible_person_id que SÍ pertenece a la organización (contacto real, vínculo organization_contacts)', function () {
    $org = Organization::factory()->create();
    $person = oaPersonInOrganization($org->id);
    $actor = actorWithOrganizationalAreaPermission(['organizational_areas.manage'], $org->id);

    $this->actingAs($actor)->postJson('/api/admin/organizational-areas', [
        'code' => 'AREA_Y', 'name' => 'Área Y', 'level' => 'Coordinación',
        'responsible_person_id' => $person->id,
    ])->assertCreated()
        ->assertJsonPath('organizational_area.responsible_person_id', $person->id);
});

// ---- update() ----

test('update edita un área (organizational_areas.manage)', function () {
    $org = Organization::factory()->create();
    $area = OrganizationalArea::factory()->create(['organization_id' => $org->id]);
    $actor = actorWithOrganizationalAreaPermission(['organizational_areas.manage'], $org->id);

    $this->actingAs($actor)->putJson("/api/admin/organizational-areas/{$area->id}", ['name' => 'Nombre editado'])
        ->assertOk()
        ->assertJsonPath('organizational_area.name', 'Nombre editado');
});

// Hallazgo Alto (revisión de especialista-seguridad): mismo fix que store(),
// aplicado también a update().
test('update rechaza un responsible_person_id de OTRA organización', function () {
    $org = Organization::factory()->create();
    $otherOrg = Organization::factory()->create();

    $area = OrganizationalArea::factory()->create(['organization_id' => $org->id]);
    $personInOtherOrg = oaPersonInOrganization($otherOrg->id);
    $actor = actorWithOrganizationalAreaPermission(['organizational_areas.manage'], $org->id);

    $this->actingAs($actor)->putJson("/api/admin/organizational-areas/{$area->id}", [
        'responsible_person_id' => $personInOtherOrg->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('responsible_person_id');
});

test('update acepta un responsible_person_id que SÍ pertenece a la organización (contacto real, vínculo organization_contacts)', function () {
    $org = Organization::factory()->create();
    $area = OrganizationalArea::factory()->create(['organization_id' => $org->id]);
    $person = oaPersonInOrganization($org->id);
    $actor = actorWithOrganizationalAreaPermission(['organizational_areas.manage'], $org->id);

    $this->actingAs($actor)->putJson("/api/admin/organizational-areas/{$area->id}", [
        'responsible_person_id' => $person->id,
    ])->assertOk()
        ->assertJsonPath('organizational_area.responsible_person_id', $person->id);
});

// ---- activate()/deactivate() ----

test('activate/deactivate respetan organizational_areas.manage y cambian is_active', function () {
    $org = Organization::factory()->create();
    $area = OrganizationalArea::factory()->create(['organization_id' => $org->id, 'is_active' => true]);
    $actor = actorWithOrganizationalAreaPermission(['organizational_areas.manage'], $org->id);

    $this->actingAs($actor)->postJson("/api/admin/organizational-areas/{$area->id}/deactivate")
        ->assertOk()
        ->assertJsonPath('organizational_area.is_active', false);
    expect($area->fresh()->is_active)->toBeFalse();

    $this->actingAs($actor)->postJson("/api/admin/organizational-areas/{$area->id}/activate")
        ->assertOk()
        ->assertJsonPath('organizational_area.is_active', true);
    expect($area->fresh()->is_active)->toBeTrue();
});

test('activate/deactivate sin organizational_areas.manage devuelven 403', function () {
    $org = Organization::factory()->create();
    $area = OrganizationalArea::factory()->create(['organization_id' => $org->id]);
    $actor = User::factory()->create(['tenant_organization_id' => $org->id]);

    $this->actingAs($actor)->postJson("/api/admin/organizational-areas/{$area->id}/activate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/organizational-areas/{$area->id}/deactivate")->assertForbidden();
});

// Hallazgo Medio (revisión de especialista-seguridad): activate()/deactivate()
// ya usaban el mismo Gate::authorize('update', ...) que update() (protegido),
// pero faltaba el test de regresión cross-tenant explícito -- mismo patrón de
// "endpoint sin testear" que ya causó fugas reales en Roles, invitaciones y
// asignación de roles en este proyecto.
test('activate/deactivate DENIEGAN (403) sobre un área de OTRA organización', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $otherArea = OrganizationalArea::factory()->create(['organization_id' => $orgB->id]);
    $actor = actorWithOrganizationalAreaPermission(['organizational_areas.manage'], $orgA->id);

    $this->actingAs($actor)->postJson("/api/admin/organizational-areas/{$otherArea->id}/activate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/organizational-areas/{$otherArea->id}/deactivate")->assertForbidden();
});
