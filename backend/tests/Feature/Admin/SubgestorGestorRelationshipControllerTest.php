<?php

use App\Models\BusinessRole;
use App\Models\Organization;
use App\Models\OrganizationBusinessRole;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\SecurityLog;
use App\Models\SubgestorGestorRelationship;
use App\Models\User;
use App\Models\UserRole;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\PlatformOrganizationSeeder;

// Vínculo comercial Subgestor -> Gestor (Fase 2, 2026-08-15). Primera relación
// comercial del sistema SIN Generador en ninguno de sus lados.
//
// A diferencia de `GeneratorGestorRelationship`, aquí gestiona el SUBGESTOR:
// un Gestor DE REFERENCIA no tiene usuarios que puedan autorizar nada.

beforeEach(function () {
    $this->seed(OrganizationStatusSeeder::class);
    $this->seed(PlatformOrganizationSeeder::class);
});

function sgActor(array $codes = [], ?int $tenantOrganizationId = null): User
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

    return $actor->fresh();
}

/**
 * Un Subgestor se identifica por `can_transport_waste`, no por
 * `can_treat_waste` -- misma convención que
 * `GeneratorSubgestorRelationshipController`.
 */
function sgSubgestorOrganization(): Organization
{
    $organization = Organization::factory()->create();
    $role = BusinessRole::factory()->create(['can_transport_waste' => true]);

    OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id,
        'business_role_id' => $role->id,
        'assigned_at' => now(),
        'is_active' => true,
    ]);

    return $organization->fresh();
}

function sgGestorOrganization(): Organization
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

function sgPlatformOrganizationId(): int
{
    return Organization::query()->where('is_platform_tenant', true)->value('id');
}

test('el Subgestor vincula un Gestor desde SU PROPIA organización', function () {
    $subgestorOrganization = sgSubgestorOrganization();
    $gestor = sgGestorOrganization();
    $actor = sgActor(['subgestor_gestor_relationships.create'], $subgestorOrganization->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/subgestor-gestor-relationships', [
        'gestor_organization_id' => $gestor->id,
    ])->assertCreated();

    $response->assertJsonPath('subgestor_gestor_relationship.subgestor_organization_id', $subgestorOrganization->id)
        ->assertJsonPath('subgestor_gestor_relationship.gestor_organization_id', $gestor->id)
        ->assertJsonPath('subgestor_gestor_relationship.is_active', true);

    expect(SecurityLog::query()->where('event_type', 'SUBGESTOR_GESTOR_RELATIONSHIP_CREATED')->exists())->toBeTrue();
});

// Anti-role-smuggling: mismo criterio que las otras dos relaciones
// comerciales -- un tenant admin no puede vincular en nombre de otro.
test('un tenant admin NO puede indicar una organización Subgestora ajena', function () {
    $subgestorOrganization = sgSubgestorOrganization();
    $otherOrganization = Organization::factory()->create();
    $gestor = sgGestorOrganization();
    $actor = sgActor(['subgestor_gestor_relationships.create'], $subgestorOrganization->id);

    $this->actingAs($actor)->postJson('/api/admin/subgestor-gestor-relationships', [
        'subgestor_organization_id' => $otherOrganization->id,
        'gestor_organization_id' => $gestor->id,
    ])->assertCreated();

    // El campo se IGNORA, no se acepta: el vínculo queda en la organización
    // del actor.
    expect(SubgestorGestorRelationship::query()->where('subgestor_organization_id', $otherOrganization->id)->exists())->toBeFalse()
        ->and(SubgestorGestorRelationship::query()->where('subgestor_organization_id', $subgestorOrganization->id)->exists())->toBeTrue();
});

test('el staff de EcoLink sí puede vincular en nombre de un Subgestor', function () {
    $subgestorOrganization = sgSubgestorOrganization();
    $gestor = sgGestorOrganization();
    $actor = sgActor(['subgestor_gestor_relationships.create'], sgPlatformOrganizationId());

    $this->actingAs($actor)->postJson('/api/admin/subgestor-gestor-relationships', [
        'subgestor_organization_id' => $subgestorOrganization->id,
        'gestor_organization_id' => $gestor->id,
    ])->assertCreated()
        ->assertJsonPath('subgestor_gestor_relationship.subgestor_organization_id', $subgestorOrganization->id);
});

test('solo se puede vincular una organización con capacidad de tratamiento', function () {
    $subgestorOrganization = sgSubgestorOrganization();
    $notAGestor = Organization::factory()->create();
    $actor = sgActor(['subgestor_gestor_relationships.create'], $subgestorOrganization->id);

    $this->actingAs($actor)->postJson('/api/admin/subgestor-gestor-relationships', [
        'gestor_organization_id' => $notAGestor->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('gestor_organization_id');
});

test('una organización no puede vincularse a sí misma', function () {
    $organization = sgGestorOrganization();
    $actor = sgActor(['subgestor_gestor_relationships.create'], $organization->id);

    $this->actingAs($actor)->postJson('/api/admin/subgestor-gestor-relationships', [
        'gestor_organization_id' => $organization->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('gestor_organization_id');
});

test('un par YA vigente se rechaza en vez de duplicarse', function () {
    $subgestorOrganization = sgSubgestorOrganization();
    $gestor = sgGestorOrganization();
    SubgestorGestorRelationship::factory()->create([
        'subgestor_organization_id' => $subgestorOrganization->id,
        'gestor_organization_id' => $gestor->id,
        'is_active' => true,
    ]);

    $actor = sgActor(['subgestor_gestor_relationships.create'], $subgestorOrganization->id);

    $this->actingAs($actor)->postJson('/api/admin/subgestor-gestor-relationships', [
        'gestor_organization_id' => $gestor->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('gestor_organization_id');
});

// El índice único es PARCIAL (solo cuando is_active): un par revocado se
// reactiva in-place, nunca se crea una segunda fila.
test('un par REVOCADO se reactiva in-place, sin crear una fila nueva', function () {
    $subgestorOrganization = sgSubgestorOrganization();
    $gestor = sgGestorOrganization();
    $revoked = SubgestorGestorRelationship::factory()->revoked()->create([
        'subgestor_organization_id' => $subgestorOrganization->id,
        'gestor_organization_id' => $gestor->id,
    ]);

    $actor = sgActor(['subgestor_gestor_relationships.create'], $subgestorOrganization->id);

    $this->actingAs($actor)->postJson('/api/admin/subgestor-gestor-relationships', [
        'gestor_organization_id' => $gestor->id,
    ])->assertCreated()
        ->assertJsonPath('subgestor_gestor_relationship.id', $revoked->id);

    expect(SubgestorGestorRelationship::query()->count())->toBe(1)
        ->and($revoked->fresh()->is_active)->toBeTrue()
        ->and($revoked->fresh()->revoked_at)->toBeNull();
});

test('sin el permiso no se puede vincular', function () {
    $subgestorOrganization = sgSubgestorOrganization();
    $gestor = sgGestorOrganization();
    $actor = sgActor(['subgestor_gestor_relationships.read'], $subgestorOrganization->id);

    $this->actingAs($actor)->postJson('/api/admin/subgestor-gestor-relationships', [
        'gestor_organization_id' => $gestor->id,
    ])->assertForbidden();
});

test('el Subgestor revoca el vínculo y el registro NO se borra', function () {
    $subgestorOrganization = sgSubgestorOrganization();
    $gestor = sgGestorOrganization();
    $relationship = SubgestorGestorRelationship::factory()->create([
        'subgestor_organization_id' => $subgestorOrganization->id,
        'gestor_organization_id' => $gestor->id,
        'is_active' => true,
    ]);

    $actor = sgActor(['subgestor_gestor_relationships.revoke'], $subgestorOrganization->id);

    $this->actingAs($actor)->postJson("/api/admin/subgestor-gestor-relationships/{$relationship->id}/revoke")
        ->assertOk()->assertJsonPath('subgestor_gestor_relationship.is_active', false);

    expect(SubgestorGestorRelationship::query()->find($relationship->id))->not->toBeNull()
        ->and($relationship->fresh()->revoked_by)->toBe($actor->id);
});

// El GESTOR ve el vínculo pero no lo gobierna -- acceso dual NO simétrico,
// mismo criterio que las otras dos relaciones.
test('el Gestor puede VER el vínculo pero NO revocarlo', function () {
    $subgestorOrganization = sgSubgestorOrganization();
    $gestor = sgGestorOrganization();
    $relationship = SubgestorGestorRelationship::factory()->create([
        'subgestor_organization_id' => $subgestorOrganization->id,
        'gestor_organization_id' => $gestor->id,
        'is_active' => true,
    ]);

    $reader = sgActor(['subgestor_gestor_relationships.read'], $gestor->id);
    $this->actingAs($reader)->getJson("/api/admin/subgestor-gestor-relationships/{$relationship->id}")->assertOk();

    $revoker = sgActor(['subgestor_gestor_relationships.revoke'], $gestor->id);
    $this->actingAs($revoker)->postJson("/api/admin/subgestor-gestor-relationships/{$relationship->id}/revoke")
        ->assertForbidden();

    expect($relationship->fresh()->is_active)->toBeTrue();
});

test('un tercero sin relación no ve el vínculo', function () {
    $relationship = SubgestorGestorRelationship::factory()->create([
        'subgestor_organization_id' => sgSubgestorOrganization()->id,
        'gestor_organization_id' => sgGestorOrganization()->id,
        'is_active' => true,
    ]);

    $actor = sgActor(['subgestor_gestor_relationships.read'], Organization::factory()->create()->id);

    $this->actingAs($actor)->getJson("/api/admin/subgestor-gestor-relationships/{$relationship->id}")
        ->assertForbidden();
});

test('index solo lista los vínculos de la propia organización', function () {
    $subgestorOrganization = sgSubgestorOrganization();
    $mine = SubgestorGestorRelationship::factory()->create([
        'subgestor_organization_id' => $subgestorOrganization->id,
        'gestor_organization_id' => sgGestorOrganization()->id,
        'is_active' => true,
    ]);
    SubgestorGestorRelationship::factory()->create([
        'subgestor_organization_id' => sgSubgestorOrganization()->id,
        'gestor_organization_id' => sgGestorOrganization()->id,
        'is_active' => true,
    ]);

    $actor = sgActor(['subgestor_gestor_relationships.read'], $subgestorOrganization->id);

    $response = $this->actingAs($actor)->getJson('/api/admin/subgestor-gestor-relationships')->assertOk();

    expect($response->json('data'))->toHaveCount(1)
        ->and($response->json('data.0.id'))->toBe($mine->id);
});

test('revocar un vínculo ya revocado responde 422', function () {
    $subgestorOrganization = sgSubgestorOrganization();
    $relationship = SubgestorGestorRelationship::factory()->revoked()->create([
        'subgestor_organization_id' => $subgestorOrganization->id,
        'gestor_organization_id' => sgGestorOrganization()->id,
    ]);

    $actor = sgActor(['subgestor_gestor_relationships.revoke'], $subgestorOrganization->id);

    $this->actingAs($actor)->postJson("/api/admin/subgestor-gestor-relationships/{$relationship->id}/revoke")
        ->assertUnprocessable();
});
