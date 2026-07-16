<?php

use App\Models\Organization;
use App\Models\OrganizationContact;
use App\Models\Permission;
use App\Models\Person;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\SecurityLog;
use App\Models\User;
use App\Models\UserRole;

// Módulo standalone "Contactos" (nuevo, `admin/contacts*`) -- acceso DUAL,
// mismo criterio que OrganizationContactControllerTest: platform staff ve
// TODOS los contactos, un admin de tenant solo los que tengan AL MENOS UN
// vínculo activo con SU organización (`tenant_organization_id`).

function adminContactActor(array $codes = [], ?int $tenantOrganizationId = null): User
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

function adminContactPlatformStaffActor(array $codes = []): User
{
    $platform = Organization::query()->where('is_platform_tenant', true)->first()
        ?? Organization::factory()->create(['is_platform_tenant' => true]);

    return adminContactActor($codes, $platform->id);
}

// ---- index() ----

test('index() devuelve 403 sin el permiso contacts.read', function () {
    $actor = adminContactActor();

    $this->actingAs($actor)->getJson('/api/admin/contacts')->assertForbidden();
});

test('index() platform staff ve contactos de CUALQUIER organización', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();
    $linkA = OrganizationContact::factory()->create(['organization_id' => $orgA->id]);
    $linkB = OrganizationContact::factory()->create(['organization_id' => $orgB->id]);

    $actor = adminContactPlatformStaffActor(['contacts.read']);

    $response = $this->actingAs($actor)->getJson('/api/admin/contacts')->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($linkA->contact_id)->toContain($linkB->contact_id);
});

test('index() tenant admin SOLO ve contactos con vínculo activo a SU organización', function () {
    $ownOrganization = Organization::factory()->create();
    $otherOrganization = Organization::factory()->create();

    $ownLink = OrganizationContact::factory()->create(['organization_id' => $ownOrganization->id]);
    $otherLink = OrganizationContact::factory()->create(['organization_id' => $otherOrganization->id]);

    $actor = adminContactActor(['contacts.read'], $ownOrganization->id);

    $response = $this->actingAs($actor)->getJson('/api/admin/contacts')->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($ownLink->contact_id)
        ->not->toContain($otherLink->contact_id);
});

test('index() NO incluye una persona cuyo único vínculo fue revocado', function () {
    $organization = Organization::factory()->create();
    $revokedLink = OrganizationContact::factory()->create(['organization_id' => $organization->id, 'is_active' => false]);

    $actor = adminContactPlatformStaffActor(['contacts.read']);

    $response = $this->actingAs($actor)->getJson('/api/admin/contacts')->assertOk();

    expect(collect($response->json('data'))->pluck('id'))->not->toContain($revokedLink->contact_id);
});

// ---- show() ----

test('show() devuelve 403 para un tenant admin sin ningún vínculo con su organización', function () {
    $organization = Organization::factory()->create();
    $otherOrganization = Organization::factory()->create();
    $link = OrganizationContact::factory()->create(['organization_id' => $otherOrganization->id]);

    $actor = adminContactActor(['contacts.read'], $organization->id);

    $this->actingAs($actor)->getJson("/api/admin/contacts/{$link->contact_id}")->assertForbidden();
});

test('show() -- un tenant admin con acceso NO ve vínculos de la misma persona con OTRAS organizaciones (hallazgo de privacidad)', function () {
    $ownOrganization = Organization::factory()->create();
    $otherOrganization = Organization::factory()->create();
    $person = Person::factory()->create();

    $ownLink = OrganizationContact::factory()->create(['organization_id' => $ownOrganization->id, 'contact_id' => $person->id, 'branch_id' => null]);
    OrganizationContact::factory()->create(['organization_id' => $otherOrganization->id, 'contact_id' => $person->id, 'branch_id' => null]);

    $actor = adminContactActor(['contacts.read'], $ownOrganization->id);

    $response = $this->actingAs($actor)->getJson("/api/admin/contacts/{$person->id}")->assertOk();

    $links = $response->json('person.organization_links');
    expect($links)->toHaveCount(1)
        ->and($links[0]['organization_id'])->toBe($ownOrganization->id)
        ->and($links[0]['organization_contact_id'])->toBe($ownLink->id);
});

test('show() platform staff SÍ ve todos los vínculos de una persona vinculada a 2+ organizaciones', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();
    $person = Person::factory()->create();

    OrganizationContact::factory()->create(['organization_id' => $orgA->id, 'contact_id' => $person->id, 'branch_id' => null]);
    OrganizationContact::factory()->create(['organization_id' => $orgB->id, 'contact_id' => $person->id, 'branch_id' => null]);

    $actor = adminContactPlatformStaffActor(['contacts.read']);

    $response = $this->actingAs($actor)->getJson("/api/admin/contacts/{$person->id}")->assertOk();

    expect($response->json('person.organization_links'))->toHaveCount(2);
});

test('show() devuelve 403 sin el permiso contacts.read AUNQUE el actor tenga un vínculo activo con la persona (hallazgo Crítico, especialista-seguridad 2026-07-16)', function () {
    $organization = Organization::factory()->create();
    $link = OrganizationContact::factory()->create(['organization_id' => $organization->id]);

    $actor = adminContactActor([], $organization->id);

    $this->actingAs($actor)->getJson("/api/admin/contacts/{$link->contact_id}")->assertForbidden();
});

test('show() NO expone organization_id/tenant_organization_id/created_by/updated_by propios de la Persona (hallazgo Alto, especialista-seguridad 2026-07-16)', function () {
    $organization = Organization::factory()->create();
    $otherOrganization = Organization::factory()->create();
    $person = Person::factory()->create(['organization_id' => $otherOrganization->id, 'tenant_organization_id' => $otherOrganization->id]);

    OrganizationContact::factory()->create(['organization_id' => $organization->id, 'contact_id' => $person->id, 'branch_id' => null]);

    $actor = adminContactActor(['contacts.read'], $organization->id);

    $response = $this->actingAs($actor)->getJson("/api/admin/contacts/{$person->id}")->assertOk();

    $data = $response->json('person');
    expect($data)->not->toHaveKey('organization_id')
        ->not->toHaveKey('tenant_organization_id')
        ->not->toHaveKey('created_by')
        ->not->toHaveKey('updated_by')
        ->not->toHaveKey('metadata');
});

test('index() acota per_page a un máximo de 100 (hallazgo Medio, especialista-seguridad 2026-07-16)', function () {
    $organization = Organization::factory()->create();
    OrganizationContact::factory()->count(3)->create(['organization_id' => $organization->id]);

    $actor = adminContactPlatformStaffActor(['contacts.read']);

    $response = $this->actingAs($actor)->getJson('/api/admin/contacts?per_page=1000')->assertOk();

    expect($response->json('per_page'))->toBe(100);
});

test('show() expone organization_contact_id no nulo y correcto (regresión: withPivot() sin "id")', function () {
    $organization = Organization::factory()->create();
    $link = OrganizationContact::factory()->create(['organization_id' => $organization->id]);

    $actor = adminContactPlatformStaffActor(['contacts.read']);

    $response = $this->actingAs($actor)->getJson("/api/admin/contacts/{$link->contact_id}")->assertOk();

    $links = $response->json('person.organization_links');
    expect($links[0]['organization_contact_id'])->not->toBeNull()->toBe($link->id);
});

// ---- update() ----

test('update() devuelve 403 para un tenant admin con permiso contacts.update pero que NO es platform staff', function () {
    $organization = Organization::factory()->create();
    $person = Person::factory()->create();
    OrganizationContact::factory()->create(['organization_id' => $organization->id, 'contact_id' => $person->id]);

    $actor = adminContactActor(['contacts.update'], $organization->id);

    $this->actingAs($actor)->patchJson("/api/admin/contacts/{$person->id}", ['first_name' => 'Hackeado'])
        ->assertForbidden();

    expect($person->fresh()->first_name)->not->toBe('Hackeado');
});

test('update() devuelve 200 para platform staff, cambia los campos de Person y audita CONTACT_UPDATED', function () {
    $organization = Organization::factory()->create();
    $person = Person::factory()->create(['first_name' => 'Original', 'last_name' => 'Apellido']);
    OrganizationContact::factory()->create(['organization_id' => $organization->id, 'contact_id' => $person->id]);

    $actor = adminContactPlatformStaffActor(['contacts.update']);

    $this->actingAs($actor)->patchJson("/api/admin/contacts/{$person->id}", [
        'first_name' => 'Actualizado',
        'phone' => '3009998877',
    ])->assertOk()->assertJsonPath('person.first_name', 'Actualizado');

    expect($person->fresh())
        ->first_name->toBe('Actualizado')
        ->phone->toBe('3009998877');

    expect(SecurityLog::query()->where('event_type', 'CONTACT_UPDATED')
        ->where('metadata->person_id', $person->id)
        ->exists())->toBeTrue();
});
