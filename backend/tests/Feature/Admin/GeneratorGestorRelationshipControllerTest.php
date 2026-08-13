<?php

use App\Models\BusinessRole;
use App\Models\GeneratorGestorRelationship;
use App\Models\Organization;
use App\Models\OrganizationBusinessRole;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserRole;
use App\Notifications\GeneratorRelationshipCreatedNotification;
use Illuminate\Support\Facades\Notification;

// Vínculo comercial DIRECTO Generador -> Gestor (Carga Masiva de
// Generadores, confirmado por el usuario 2026-08-11) -- `generator_gestor_relationships`.
// MISMO PATRÓN de test que GeneratorSubgestorRelationshipControllerTest,
// roles invertidos (aquí el GESTOR es quien autoriza/gestiona).

function ggrActor(array $codes = [], ?int $tenantOrganizationId = null): User
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

function ggrPlatformStaffActor(array $codes = []): User
{
    $platform = Organization::query()->where('is_platform_tenant', true)->first()
        ?? Organization::factory()->create(['is_platform_tenant' => true]);

    return ggrActor($codes, $platform->id);
}

function ggrOrganizationWithBusinessRole(string $flag): Organization
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

function ggrGeneratorOrganization(): Organization
{
    return ggrOrganizationWithBusinessRole('can_generate_waste');
}

function ggrGestorOrganization(): Organization
{
    return ggrOrganizationWithBusinessRole('can_treat_waste');
}

// ---- store(): creación válida + anti-IDOR + validación de capacidad ----

test('store crea la relación vigente cuando el Gestor registra un Generador con can_generate_waste=true', function () {
    $gestor = ggrGestorOrganization();
    $generator = ggrGeneratorOrganization();
    $actor = ggrActor(['generator_gestor_relationships.create'], $gestor->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/generator-gestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertCreated();

    $response->assertJsonPath('generator_gestor_relationship.gestor_organization_id', $gestor->id)
        ->assertJsonPath('generator_gestor_relationship.generator_organization_id', $generator->id)
        ->assertJsonPath('generator_gestor_relationship.is_active', true);

    expect(GeneratorGestorRelationship::query()
        ->where('generator_organization_id', $generator->id)
        ->where('gestor_organization_id', $gestor->id)
        ->where('is_active', true)
        ->exists())->toBeTrue();
});

test('store rechaza un generator_organization_id SIN can_generate_waste=true', function () {
    $gestor = ggrGestorOrganization();
    $nonGenerator = Organization::factory()->create();
    $actor = ggrActor(['generator_gestor_relationships.create'], $gestor->id);

    $this->actingAs($actor)->postJson('/api/admin/generator-gestor-relationships', [
        'generator_organization_id' => $nonGenerator->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('generator_organization_id');

    expect(GeneratorGestorRelationship::query()->count())->toBe(0);
});

test('store rechaza que un Gestor se registre a sí mismo como su propio Generador cliente', function () {
    $gestor = ggrGestorOrganization();
    $actor = ggrActor(['generator_gestor_relationships.create'], $gestor->id);

    $this->actingAs($actor)->postJson('/api/admin/generator-gestor-relationships', [
        'generator_organization_id' => $gestor->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('generator_organization_id');
});

test('store rechaza duplicar una relación YA vigente para el mismo par', function () {
    $gestor = ggrGestorOrganization();
    $generator = ggrGeneratorOrganization();
    $actor = ggrActor(['generator_gestor_relationships.create'], $gestor->id);

    $this->actingAs($actor)->postJson('/api/admin/generator-gestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertCreated();

    $this->actingAs($actor)->postJson('/api/admin/generator-gestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('generator_organization_id');

    expect(GeneratorGestorRelationship::query()->count())->toBe(1);
});

test('store reactiva (in-place) una relación previamente REVOCADA del mismo par, sin duplicar filas', function () {
    $gestor = ggrGestorOrganization();
    $generator = ggrGeneratorOrganization();
    $actor = ggrActor(['generator_gestor_relationships.create', 'generator_gestor_relationships.revoke'], $gestor->id);

    $created = $this->actingAs($actor)->postJson('/api/admin/generator-gestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertCreated();

    $relationshipId = $created->json('generator_gestor_relationship.id');
    $this->actingAs($actor)->postJson("/api/admin/generator-gestor-relationships/{$relationshipId}/revoke")->assertOk();

    $this->actingAs($actor)->postJson('/api/admin/generator-gestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertCreated()->assertJsonPath('generator_gestor_relationship.id', $relationshipId)
        ->assertJsonPath('generator_gestor_relationship.is_active', true);

    expect(GeneratorGestorRelationship::query()->count())->toBe(1);
});

test('store (anti-IDOR): un tenant admin NO puede inyectar un gestor_organization_id ajeno -- siempre se usa su propio tenant', function () {
    $gestor = ggrGestorOrganization();
    $otherGestor = ggrGestorOrganization();
    $generator = ggrGeneratorOrganization();
    $actor = ggrActor(['generator_gestor_relationships.create'], $gestor->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/generator-gestor-relationships', [
        'gestor_organization_id' => $otherGestor->id, // debe ignorarse -- no es platform staff
        'generator_organization_id' => $generator->id,
    ])->assertCreated();

    $response->assertJsonPath('generator_gestor_relationship.gestor_organization_id', $gestor->id);
    expect(GeneratorGestorRelationship::query()->where('gestor_organization_id', $otherGestor->id)->exists())->toBeFalse();
});

test('store permite a platform staff indicar explícitamente gestor_organization_id', function () {
    $gestor = ggrGestorOrganization();
    $generator = ggrGeneratorOrganization();
    $actor = ggrPlatformStaffActor(['generator_gestor_relationships.create']);

    $this->actingAs($actor)->postJson('/api/admin/generator-gestor-relationships', [
        'gestor_organization_id' => $gestor->id,
        'generator_organization_id' => $generator->id,
    ])->assertCreated()->assertJsonPath('generator_gestor_relationship.gestor_organization_id', $gestor->id);
});

// ---- revoke(): solo el Gestor dueño ----

test('revoke() marca is_active=false SIN borrar el registro (soft-delete/físico)', function () {
    $gestor = ggrGestorOrganization();
    $generator = ggrGeneratorOrganization();
    $actor = ggrActor(['generator_gestor_relationships.create', 'generator_gestor_relationships.revoke'], $gestor->id);

    $created = $this->actingAs($actor)->postJson('/api/admin/generator-gestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertCreated();

    $relationshipId = $created->json('generator_gestor_relationship.id');

    $this->actingAs($actor)->postJson("/api/admin/generator-gestor-relationships/{$relationshipId}/revoke")
        ->assertOk()
        ->assertJsonPath('generator_gestor_relationship.is_active', false);

    $relationship = GeneratorGestorRelationship::query()->findOrFail($relationshipId);
    expect($relationship->is_active)->toBeFalse()
        ->and($relationship->revoked_by)->toBe($actor->id)
        ->and($relationship->revoked_at)->not->toBeNull()
        ->and($relationship->trashed())->toBeFalse();
});

test('revoke() (anti-IDOR): el Generador cliente NO puede revocar la relación por su cuenta', function () {
    $gestor = ggrGestorOrganization();
    $generator = ggrGeneratorOrganization();
    $gestorActor = ggrActor(['generator_gestor_relationships.create'], $gestor->id);

    $created = $this->actingAs($gestorActor)->postJson('/api/admin/generator-gestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertCreated();

    $relationshipId = $created->json('generator_gestor_relationship.id');
    $generatorActor = ggrActor(['generator_gestor_relationships.revoke'], $generator->id);

    $this->actingAs($generatorActor)->postJson("/api/admin/generator-gestor-relationships/{$relationshipId}/revoke")
        ->assertForbidden();

    expect(GeneratorGestorRelationship::query()->findOrFail($relationshipId)->is_active)->toBeTrue();
});

test('revoke() rechaza revocar una relación que YA está revocada', function () {
    $gestor = ggrGestorOrganization();
    $generator = ggrGeneratorOrganization();
    $actor = ggrActor(['generator_gestor_relationships.create', 'generator_gestor_relationships.revoke'], $gestor->id);

    $created = $this->actingAs($actor)->postJson('/api/admin/generator-gestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertCreated();

    $relationshipId = $created->json('generator_gestor_relationship.id');
    $this->actingAs($actor)->postJson("/api/admin/generator-gestor-relationships/{$relationshipId}/revoke")->assertOk();

    $this->actingAs($actor)->postJson("/api/admin/generator-gestor-relationships/{$relationshipId}/revoke")
        ->assertUnprocessable();
});

// ---- index()/show(): acceso dual (Generador Y Gestor) ----

test('show(): AMBOS lados (Generador Y Gestor) pueden ver la relación; un tercero recibe 403', function () {
    $gestor = ggrGestorOrganization();
    $generator = ggrGeneratorOrganization();
    $foreign = ggrGestorOrganization();

    $gestorActor = ggrActor(['generator_gestor_relationships.create', 'generator_gestor_relationships.read'], $gestor->id);
    $created = $this->actingAs($gestorActor)->postJson('/api/admin/generator-gestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertCreated();
    $relationshipId = $created->json('generator_gestor_relationship.id');

    $generatorActor = ggrActor(['generator_gestor_relationships.read'], $generator->id);
    $this->actingAs($generatorActor)->getJson("/api/admin/generator-gestor-relationships/{$relationshipId}")->assertOk();

    $foreignActor = ggrActor(['generator_gestor_relationships.read'], $foreign->id);
    $this->actingAs($foreignActor)->getJson("/api/admin/generator-gestor-relationships/{$relationshipId}")->assertForbidden();
});

test('index(): un Gestor ve las relaciones que ÉL registró; un Generador ve las que lo registraron a él', function () {
    $gestor = ggrGestorOrganization();
    $generator = ggrGeneratorOrganization();
    $gestorActor = ggrActor(['generator_gestor_relationships.create', 'generator_gestor_relationships.read'], $gestor->id);

    $this->actingAs($gestorActor)->postJson('/api/admin/generator-gestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertCreated();

    $viewGestor = $this->actingAs($gestorActor)->getJson('/api/admin/generator-gestor-relationships')->assertOk();
    expect($viewGestor->json('total'))->toBe(1);

    $generatorActor = ggrActor(['generator_gestor_relationships.read'], $generator->id);
    $viewGenerator = $this->actingAs($generatorActor)->getJson('/api/admin/generator-gestor-relationships')->assertOk();
    expect($viewGenerator->json('total'))->toBe(1);

    $foreign = ggrGestorOrganization();
    $foreignActor = ggrActor(['generator_gestor_relationships.read'], $foreign->id);
    $viewForeign = $this->actingAs($foreignActor)->getJson('/api/admin/generator-gestor-relationships')->assertOk();
    expect($viewForeign->json('total'))->toBe(0);
});

// ---- Notificación al Generador (hallazgo de especialista-seguridad, 2026-08-12) ----
// El vínculo se crea de forma UNILATERAL por el Gestor -- se le da al
// Generador VISIBILIDAD (correo), no control (sigue sin poder revocar,
// ver test de arriba). Ver `GeneratorRelationshipCreatedNotification`.

test('store() notifica por correo a los usuarios del Generador con generator_gestor_relationships.read, no a los del Gestor', function () {
    Notification::fake();

    $gestor = ggrGestorOrganization();
    $generator = ggrGeneratorOrganization();
    $actor = ggrActor(['generator_gestor_relationships.create'], $gestor->id);
    $generatorReader = ggrActor(['generator_gestor_relationships.read'], $generator->id);

    $this->actingAs($actor)->postJson('/api/admin/generator-gestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertCreated();

    Notification::assertSentTo($generatorReader, GeneratorRelationshipCreatedNotification::class);
    Notification::assertNotSentTo($actor, GeneratorRelationshipCreatedNotification::class);
});

test('store() NO notifica a un usuario del Generador SIN el permiso generator_gestor_relationships.read', function () {
    Notification::fake();

    $gestor = ggrGestorOrganization();
    $generator = ggrGeneratorOrganization();
    $actor = ggrActor(['generator_gestor_relationships.create'], $gestor->id);
    $generatorUserWithoutPermission = ggrActor(['wastes.read'], $generator->id);

    $this->actingAs($actor)->postJson('/api/admin/generator-gestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertCreated();

    Notification::assertNotSentTo($generatorUserWithoutPermission, GeneratorRelationshipCreatedNotification::class);
});

test('reactivar (tras revocar) vuelve a notificar al Generador', function () {
    Notification::fake();

    $gestor = ggrGestorOrganization();
    $generator = ggrGeneratorOrganization();
    $actor = ggrActor(['generator_gestor_relationships.create', 'generator_gestor_relationships.revoke'], $gestor->id);
    $generatorReader = ggrActor(['generator_gestor_relationships.read'], $generator->id);

    $created = $this->actingAs($actor)->postJson('/api/admin/generator-gestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertCreated();

    $relationshipId = $created->json('generator_gestor_relationship.id');
    $this->actingAs($actor)->postJson("/api/admin/generator-gestor-relationships/{$relationshipId}/revoke")->assertOk();

    $this->actingAs($actor)->postJson('/api/admin/generator-gestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertCreated();

    expect(Notification::sent($generatorReader, GeneratorRelationshipCreatedNotification::class))->toHaveCount(2);
});

test('store() rechazado (par ya vigente) NO reenvía la notificación', function () {
    Notification::fake();

    $gestor = ggrGestorOrganization();
    $generator = ggrGeneratorOrganization();
    $actor = ggrActor(['generator_gestor_relationships.create'], $gestor->id);
    $generatorReader = ggrActor(['generator_gestor_relationships.read'], $generator->id);

    $this->actingAs($actor)->postJson('/api/admin/generator-gestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertCreated();

    $this->actingAs($actor)->postJson('/api/admin/generator-gestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertUnprocessable();

    expect(Notification::sent($generatorReader, GeneratorRelationshipCreatedNotification::class))->toHaveCount(1);
});

// ---- Respaldo cuando el único destinatario resuelto tiene correo placeholder (2026-08-13) ----
// Escenario de un Generador YA EXISTENTE cuyo único usuario tiene correo
// placeholder (dato legado, de antes de que `correo_organizacion` fuera
// obligatorio en Carga Masiva -- el flujo normal ya NO puede producir un
// Generador nuevo así). Se simula directamente (sin pasar por Carga Masiva)
// para poder controlar el correo del usuario y el de la organización.

test('store(): si el único destinatario resuelto tiene correo placeholder, el aviso cae en Organization.email en vez de en ese usuario', function () {
    Notification::fake();

    $gestor = ggrGestorOrganization();
    $generator = ggrGeneratorOrganization();
    $generator->forceFill(['email' => 'contacto@generador-legado.example.com'])->save();

    $role = Role::factory()->create();
    $permission = Permission::query()->firstOrCreate(['code' => 'generator_gestor_relationships.read'], [
        'name' => 'generator_gestor_relationships.read', 'module' => 'generator_gestor_relationships', 'action' => 'read',
        'scope' => 'tenant', 'is_system' => true, 'is_active' => true,
    ]);
    RolePermission::query()->create(['role_id' => $role->id, 'permission_id' => $permission->id, 'is_active' => true]);
    $placeholderUser = User::factory()->create(['tenant_organization_id' => $generator->id, 'email' => 'admin.legado@sin-correo.invalid']);
    UserRole::query()->create(['user_id' => $placeholderUser->id, 'role_id' => $role->id, 'is_active' => true]);

    $actor = ggrActor(['generator_gestor_relationships.create'], $gestor->id);

    $this->actingAs($actor)->postJson('/api/admin/generator-gestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertCreated();

    Notification::assertNotSentTo($placeholderUser, GeneratorRelationshipCreatedNotification::class);
    Notification::assertSentOnDemand(
        GeneratorRelationshipCreatedNotification::class,
        fn ($notification, $channels, $notifiable) => $notifiable->routes['mail'] === 'contacto@generador-legado.example.com'
    );
});

test('store(): si el único destinatario resuelto tiene correo placeholder Y la organización TAMPOCO tiene email (dato legado), no se envía nada -- sin excepción', function () {
    Notification::fake();

    $gestor = ggrGestorOrganization();
    $generator = ggrGeneratorOrganization();
    $generator->forceFill(['email' => null])->save();

    $role = Role::factory()->create();
    $permission = Permission::query()->firstOrCreate(['code' => 'generator_gestor_relationships.read'], [
        'name' => 'generator_gestor_relationships.read', 'module' => 'generator_gestor_relationships', 'action' => 'read',
        'scope' => 'tenant', 'is_system' => true, 'is_active' => true,
    ]);
    RolePermission::query()->create(['role_id' => $role->id, 'permission_id' => $permission->id, 'is_active' => true]);
    $placeholderUser = User::factory()->create(['tenant_organization_id' => $generator->id, 'email' => 'admin.legado@sin-correo.invalid']);
    UserRole::query()->create(['user_id' => $placeholderUser->id, 'role_id' => $role->id, 'is_active' => true]);

    $actor = ggrActor(['generator_gestor_relationships.create'], $gestor->id);

    $this->actingAs($actor)->postJson('/api/admin/generator-gestor-relationships', [
        'generator_organization_id' => $generator->id,
    ])->assertCreated();

    Notification::assertNothingSent();
});
