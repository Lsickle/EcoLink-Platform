<?php

use App\Models\BusinessRole;
use App\Models\GeneratorSubgestorRelationship;
use App\Models\Organization;
use App\Models\OrganizationBusinessRole;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserRole;
use App\Notifications\GeneratorRelationshipCreatedNotification;
use Illuminate\Support\Facades\Notification;

// Cadena Generador -> Subgestor -> Gestor en Declaración de Residuos
// (confirmado por stakeholders reales, 2026-08-09) -- `generator_subgestor_relationships`.
// Ver docblock de la migración create_generator_subgestor_relationships_table
// y de GeneratorSubgestorRelationshipController para el diseño completo.
// MISMO PATRÓN de test que GestorCarrierAuthorizationControllerTest, roles
// invertidos (aquí el SUBGESTOR es quien autoriza/gestiona).

function gsrActor(array $codes = [], ?int $tenantOrganizationId = null): User
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

function gsrPlatformStaffActor(array $codes = []): User
{
    $platform = Organization::query()->where('is_platform_tenant', true)->first()
        ?? Organization::factory()->create(['is_platform_tenant' => true]);

    return gsrActor($codes, $platform->id);
}

function gsrOrganizationWithBusinessRole(string $flag): Organization
{
    $organization = Organization::factory()->create();
    $businessRole = BusinessRole::factory()->create([$flag => true]);

    OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id,
        'business_role_id' => $businessRole->id,
        'assigned_at' => now(),
        'is_active' => true,
    ]);

    return $organization->fresh();
}

function gsrGeneratorOrganization(): Organization
{
    return gsrOrganizationWithBusinessRole('can_generate_waste');
}

function gsrSubgestorOrganization(): Organization
{
    return gsrOrganizationWithBusinessRole('can_transport_waste');
}

// ---- store(): creación válida + anti-IDOR + validación de capacidad ----

test('store crea la relación vigente cuando el Subgestor registra un Generador con can_generate_waste=true', function () {
    $subgestor = gsrSubgestorOrganization();
    $generator = gsrGeneratorOrganization();
    $actor = gsrActor(['generator_subgestor_relationships.create'], $subgestor->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/generator-subgestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertCreated();

    $response->assertJsonPath('generator_subgestor_relationship.subgestor_organization_id', $subgestor->id)
        ->assertJsonPath('generator_subgestor_relationship.generator_organization_id', $generator->id)
        ->assertJsonPath('generator_subgestor_relationship.is_active', true);

    expect(GeneratorSubgestorRelationship::query()
        ->where('generator_organization_id', $generator->id)
        ->where('subgestor_organization_id', $subgestor->id)
        ->where('is_active', true)
        ->exists())->toBeTrue();
});

test('store rechaza un generator_organization_id SIN can_generate_waste=true', function () {
    $subgestor = gsrSubgestorOrganization();
    $nonGenerator = Organization::factory()->create();
    $actor = gsrActor(['generator_subgestor_relationships.create'], $subgestor->id);

    $this->actingAs($actor)->postJson('/api/admin/generator-subgestor-relationships', [
        'generator_organization_id' => $nonGenerator->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('generator_organization_id');

    expect(GeneratorSubgestorRelationship::query()->count())->toBe(0);
});

test('store rechaza que un Subgestor se registre a sí mismo como su propio Generador cliente', function () {
    $subgestor = gsrSubgestorOrganization();
    $actor = gsrActor(['generator_subgestor_relationships.create'], $subgestor->id);

    $this->actingAs($actor)->postJson('/api/admin/generator-subgestor-relationships', [
        'generator_organization_id' => $subgestor->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('generator_organization_id');
});

test('store rechaza duplicar una relación YA vigente para el mismo par', function () {
    $subgestor = gsrSubgestorOrganization();
    $generator = gsrGeneratorOrganization();
    $actor = gsrActor(['generator_subgestor_relationships.create'], $subgestor->id);

    $this->actingAs($actor)->postJson('/api/admin/generator-subgestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertCreated();

    $this->actingAs($actor)->postJson('/api/admin/generator-subgestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('generator_organization_id');

    expect(GeneratorSubgestorRelationship::query()->count())->toBe(1);
});

test('store reactiva (in-place) una relación previamente REVOCADA del mismo par, sin duplicar filas', function () {
    $subgestor = gsrSubgestorOrganization();
    $generator = gsrGeneratorOrganization();
    $actor = gsrActor(['generator_subgestor_relationships.create', 'generator_subgestor_relationships.revoke'], $subgestor->id);

    $created = $this->actingAs($actor)->postJson('/api/admin/generator-subgestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertCreated();

    $relationshipId = $created->json('generator_subgestor_relationship.id');
    $this->actingAs($actor)->postJson("/api/admin/generator-subgestor-relationships/{$relationshipId}/revoke")->assertOk();

    $this->actingAs($actor)->postJson('/api/admin/generator-subgestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertCreated()->assertJsonPath('generator_subgestor_relationship.id', $relationshipId)
        ->assertJsonPath('generator_subgestor_relationship.is_active', true);

    expect(GeneratorSubgestorRelationship::query()->count())->toBe(1);
});

test('store (anti-IDOR): un tenant admin NO puede inyectar un subgestor_organization_id ajeno -- siempre se usa su propio tenant', function () {
    $subgestor = gsrSubgestorOrganization();
    $otherSubgestor = gsrSubgestorOrganization();
    $generator = gsrGeneratorOrganization();
    $actor = gsrActor(['generator_subgestor_relationships.create'], $subgestor->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/generator-subgestor-relationships', [
        'subgestor_organization_id' => $otherSubgestor->id, // debe ignorarse -- no es platform staff
        'generator_organization_id' => $generator->id,
    ])->assertCreated();

    $response->assertJsonPath('generator_subgestor_relationship.subgestor_organization_id', $subgestor->id);
    expect(GeneratorSubgestorRelationship::query()->where('subgestor_organization_id', $otherSubgestor->id)->exists())->toBeFalse();
});

test('store (anti-IDOR): el Generador NO puede auto-registrarse (subgestor_organization_id forzado == generator_organization_id)', function () {
    $generator = gsrGeneratorOrganization();
    // El actor pertenece a la organización Generadora, no a un Subgestor.
    $actor = gsrActor(['generator_subgestor_relationships.create'], $generator->id);

    $this->actingAs($actor)->postJson('/api/admin/generator-subgestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('generator_organization_id');

    expect(GeneratorSubgestorRelationship::query()->count())->toBe(0);
});

test('store permite a platform staff indicar explícitamente subgestor_organization_id', function () {
    $subgestor = gsrSubgestorOrganization();
    $generator = gsrGeneratorOrganization();
    $actor = gsrPlatformStaffActor(['generator_subgestor_relationships.create']);

    $this->actingAs($actor)->postJson('/api/admin/generator-subgestor-relationships', [
        'subgestor_organization_id' => $subgestor->id,
        'generator_organization_id' => $generator->id,
    ])->assertCreated()->assertJsonPath('generator_subgestor_relationship.subgestor_organization_id', $subgestor->id);
});

// ---- revoke(): solo el Subgestor dueño ----

test('revoke() marca is_active=false SIN borrar el registro (soft-delete/físico)', function () {
    $subgestor = gsrSubgestorOrganization();
    $generator = gsrGeneratorOrganization();
    $actor = gsrActor(['generator_subgestor_relationships.create', 'generator_subgestor_relationships.revoke'], $subgestor->id);

    $created = $this->actingAs($actor)->postJson('/api/admin/generator-subgestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertCreated();

    $relationshipId = $created->json('generator_subgestor_relationship.id');

    $this->actingAs($actor)->postJson("/api/admin/generator-subgestor-relationships/{$relationshipId}/revoke")
        ->assertOk()
        ->assertJsonPath('generator_subgestor_relationship.is_active', false);

    $relationship = GeneratorSubgestorRelationship::query()->findOrFail($relationshipId);
    expect($relationship->is_active)->toBeFalse()
        ->and($relationship->revoked_by)->toBe($actor->id)
        ->and($relationship->revoked_at)->not->toBeNull()
        ->and($relationship->trashed())->toBeFalse();
});

test('revoke() (anti-IDOR): el Generador cliente NO puede revocar la relación por su cuenta', function () {
    $subgestor = gsrSubgestorOrganization();
    $generator = gsrGeneratorOrganization();
    $subgestorActor = gsrActor(['generator_subgestor_relationships.create'], $subgestor->id);

    $created = $this->actingAs($subgestorActor)->postJson('/api/admin/generator-subgestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertCreated();

    $relationshipId = $created->json('generator_subgestor_relationship.id');
    $generatorActor = gsrActor(['generator_subgestor_relationships.revoke'], $generator->id);

    $this->actingAs($generatorActor)->postJson("/api/admin/generator-subgestor-relationships/{$relationshipId}/revoke")
        ->assertForbidden();

    expect(GeneratorSubgestorRelationship::query()->findOrFail($relationshipId)->is_active)->toBeTrue();
});

test('revoke() rechaza revocar una relación que YA está revocada', function () {
    $subgestor = gsrSubgestorOrganization();
    $generator = gsrGeneratorOrganization();
    $actor = gsrActor(['generator_subgestor_relationships.create', 'generator_subgestor_relationships.revoke'], $subgestor->id);

    $created = $this->actingAs($actor)->postJson('/api/admin/generator-subgestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertCreated();

    $relationshipId = $created->json('generator_subgestor_relationship.id');
    $this->actingAs($actor)->postJson("/api/admin/generator-subgestor-relationships/{$relationshipId}/revoke")->assertOk();

    $this->actingAs($actor)->postJson("/api/admin/generator-subgestor-relationships/{$relationshipId}/revoke")
        ->assertUnprocessable();
});

// ---- index()/show(): acceso dual (Generador Y Subgestor) ----

test('show(): AMBOS lados (Generador Y Subgestor) pueden ver la relación; un tercero recibe 403', function () {
    $subgestor = gsrSubgestorOrganization();
    $generator = gsrGeneratorOrganization();
    $foreign = gsrSubgestorOrganization();

    $subgestorActor = gsrActor(['generator_subgestor_relationships.create', 'generator_subgestor_relationships.read'], $subgestor->id);
    $created = $this->actingAs($subgestorActor)->postJson('/api/admin/generator-subgestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertCreated();
    $relationshipId = $created->json('generator_subgestor_relationship.id');

    $generatorActor = gsrActor(['generator_subgestor_relationships.read'], $generator->id);
    $this->actingAs($generatorActor)->getJson("/api/admin/generator-subgestor-relationships/{$relationshipId}")->assertOk();

    $foreignActor = gsrActor(['generator_subgestor_relationships.read'], $foreign->id);
    $this->actingAs($foreignActor)->getJson("/api/admin/generator-subgestor-relationships/{$relationshipId}")->assertForbidden();
});

test('index(): un Subgestor ve las relaciones que ÉL registró; un Generador ve las que lo registraron a él', function () {
    $subgestor = gsrSubgestorOrganization();
    $generator = gsrGeneratorOrganization();
    $subgestorActor = gsrActor(['generator_subgestor_relationships.create', 'generator_subgestor_relationships.read'], $subgestor->id);

    $this->actingAs($subgestorActor)->postJson('/api/admin/generator-subgestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertCreated();

    $viewSubgestor = $this->actingAs($subgestorActor)->getJson('/api/admin/generator-subgestor-relationships')->assertOk();
    expect($viewSubgestor->json('total'))->toBe(1);

    $generatorActor = gsrActor(['generator_subgestor_relationships.read'], $generator->id);
    $viewGenerator = $this->actingAs($generatorActor)->getJson('/api/admin/generator-subgestor-relationships')->assertOk();
    expect($viewGenerator->json('total'))->toBe(1);

    $foreign = gsrSubgestorOrganization();
    $foreignActor = gsrActor(['generator_subgestor_relationships.read'], $foreign->id);
    $viewForeign = $this->actingAs($foreignActor)->getJson('/api/admin/generator-subgestor-relationships')->assertOk();
    expect($viewForeign->json('total'))->toBe(0);
});

// ---- Notificación al Generador (hallazgo de especialista-seguridad, 2026-08-12) ----
// El vínculo se crea de forma UNILATERAL por el Subgestor -- se le da al
// Generador VISIBILIDAD (correo), no control (sigue sin poder revocar, ver
// test de arriba). Ver `GeneratorRelationshipCreatedNotification`.

test('store() notifica por correo a los usuarios del Generador con generator_subgestor_relationships.read, no a los del Subgestor', function () {
    Notification::fake();

    $subgestor = gsrSubgestorOrganization();
    $generator = gsrGeneratorOrganization();
    $actor = gsrActor(['generator_subgestor_relationships.create'], $subgestor->id);
    $generatorReader = gsrActor(['generator_subgestor_relationships.read'], $generator->id);

    $this->actingAs($actor)->postJson('/api/admin/generator-subgestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertCreated();

    Notification::assertSentTo($generatorReader, GeneratorRelationshipCreatedNotification::class);
    Notification::assertNotSentTo($actor, GeneratorRelationshipCreatedNotification::class);
});

test('store() NO notifica a un usuario del Generador SIN el permiso generator_subgestor_relationships.read', function () {
    Notification::fake();

    $subgestor = gsrSubgestorOrganization();
    $generator = gsrGeneratorOrganization();
    $actor = gsrActor(['generator_subgestor_relationships.create'], $subgestor->id);
    $generatorUserWithoutPermission = gsrActor(['wastes.read'], $generator->id);

    $this->actingAs($actor)->postJson('/api/admin/generator-subgestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertCreated();

    Notification::assertNotSentTo($generatorUserWithoutPermission, GeneratorRelationshipCreatedNotification::class);
});

test('reactivar (tras revocar) vuelve a notificar al Generador', function () {
    Notification::fake();

    $subgestor = gsrSubgestorOrganization();
    $generator = gsrGeneratorOrganization();
    $actor = gsrActor(['generator_subgestor_relationships.create', 'generator_subgestor_relationships.revoke'], $subgestor->id);
    $generatorReader = gsrActor(['generator_subgestor_relationships.read'], $generator->id);

    $created = $this->actingAs($actor)->postJson('/api/admin/generator-subgestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertCreated();

    $relationshipId = $created->json('generator_subgestor_relationship.id');
    $this->actingAs($actor)->postJson("/api/admin/generator-subgestor-relationships/{$relationshipId}/revoke")->assertOk();

    $this->actingAs($actor)->postJson('/api/admin/generator-subgestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertCreated();

    expect(Notification::sent($generatorReader, GeneratorRelationshipCreatedNotification::class))->toHaveCount(2);
});

test('store() rechazado (par ya vigente) NO reenvía la notificación', function () {
    Notification::fake();

    $subgestor = gsrSubgestorOrganization();
    $generator = gsrGeneratorOrganization();
    $actor = gsrActor(['generator_subgestor_relationships.create'], $subgestor->id);
    $generatorReader = gsrActor(['generator_subgestor_relationships.read'], $generator->id);

    $this->actingAs($actor)->postJson('/api/admin/generator-subgestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertCreated();

    $this->actingAs($actor)->postJson('/api/admin/generator-subgestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertUnprocessable();

    expect(Notification::sent($generatorReader, GeneratorRelationshipCreatedNotification::class))->toHaveCount(1);
});
