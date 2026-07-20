<?php

use App\Models\BusinessRole;
use App\Models\GestorCarrierAuthorization;
use App\Models\Organization;
use App\Models\OrganizationBusinessRole;
use App\Models\Role;
use App\Models\User;
use App\Models\UserRole;
use Database\Seeders\BusinessRoleSeeder;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\PlatformOrganizationSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;

// Módulo Programación Logística, Fase 4 -- "Modalidad 3" (revisión
// especialista-seguridad): `gestor_carrier_authorizations`. Ver docblock de
// la migración create_gestor_carrier_authorizations_table y de
// GestorCarrierAuthorizationController para el diseño completo.
beforeEach(function () {
    $this->seed(OrganizationStatusSeeder::class);
    $this->seed(PlatformOrganizationSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->seed(PermissionSeeder::class);
    $this->seed(RolePermissionSeeder::class);
    $this->seed(BusinessRoleSeeder::class);
});

function gcaActor(array $codes = [], ?int $tenantOrganizationId = null): User
{
    $actor = User::factory()->create(['tenant_organization_id' => $tenantOrganizationId]);

    if ($codes !== []) {
        $role = Role::query()->where('code', 'LOGÍSTICA')->firstOrFail();
        UserRole::query()->create(['user_id' => $actor->id, 'role_id' => $role->id, 'is_active' => true]);
    }

    return $actor;
}

function gcaPlatformStaffActor(array $codes = []): User
{
    $platform = Organization::query()->where('is_platform_tenant', true)->first()
        ?? Organization::factory()->create(['is_platform_tenant' => true]);

    return gcaActor($codes, $platform->id);
}

function gcaOrganizationWithBusinessRole(string $businessRoleCode): Organization
{
    $organization = Organization::factory()->create();
    $businessRole = BusinessRole::query()->where('code', $businessRoleCode)->firstOrFail();

    OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id,
        'business_role_id' => $businessRole->id,
        'assigned_at' => now(),
        'is_active' => true,
    ]);

    return $organization->fresh();
}

function gcaGestorOrganization(): Organization
{
    return gcaOrganizationWithBusinessRole('GESTOR');
}

/**
 * TRANSPORTER: organización dedicada EXCLUSIVAMENTE al transporte, distinta
 * del Gestor -- el escenario real de "Modalidad 3" (transportador
 * independiente contratado por un Gestor).
 */
function gcaCarrierOrganization(): Organization
{
    return gcaOrganizationWithBusinessRole('TRANSPORTER');
}

function gcaNonCarrierOrganization(): Organization
{
    return gcaOrganizationWithBusinessRole('GENERATOR');
}

// ---- store(): creación válida + anti-IDOR + validación de capacidad ----

test('store crea la autorización vigente cuando el Gestor autoriza a un Transportador con can_transport_waste=true', function () {
    $gestor = gcaGestorOrganization();
    $carrier = gcaCarrierOrganization();
    $actor = gcaActor(['gestor_carrier_authorizations.create'], $gestor->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/gestor-carrier-authorizations', [
        'carrier_organization_id' => $carrier->id,
    ])->assertCreated();

    $response->assertJsonPath('gestor_carrier_authorization.gestor_organization_id', $gestor->id)
        ->assertJsonPath('gestor_carrier_authorization.carrier_organization_id', $carrier->id)
        ->assertJsonPath('gestor_carrier_authorization.is_active', true);

    expect(GestorCarrierAuthorization::query()
        ->where('gestor_organization_id', $gestor->id)
        ->where('carrier_organization_id', $carrier->id)
        ->where('is_active', true)
        ->exists())->toBeTrue();
});

test('store rechaza (e) un carrier_organization_id SIN can_transport_waste=true', function () {
    $gestor = gcaGestorOrganization();
    $nonCarrier = gcaNonCarrierOrganization();
    $actor = gcaActor(['gestor_carrier_authorizations.create'], $gestor->id);

    $this->actingAs($actor)->postJson('/api/admin/gestor-carrier-authorizations', [
        'carrier_organization_id' => $nonCarrier->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('carrier_organization_id');

    expect(GestorCarrierAuthorization::query()->count())->toBe(0);
});

test('store rechaza que un Gestor se autorice a sí mismo como transportador', function () {
    $gestor = gcaGestorOrganization();
    $actor = gcaActor(['gestor_carrier_authorizations.create'], $gestor->id);

    $this->actingAs($actor)->postJson('/api/admin/gestor-carrier-authorizations', [
        'carrier_organization_id' => $gestor->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('carrier_organization_id');
});

test('store rechaza duplicar una autorización YA vigente para el mismo par', function () {
    $gestor = gcaGestorOrganization();
    $carrier = gcaCarrierOrganization();
    $actor = gcaActor(['gestor_carrier_authorizations.create'], $gestor->id);

    $this->actingAs($actor)->postJson('/api/admin/gestor-carrier-authorizations', [
        'carrier_organization_id' => $carrier->id,
    ])->assertCreated();

    $this->actingAs($actor)->postJson('/api/admin/gestor-carrier-authorizations', [
        'carrier_organization_id' => $carrier->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('carrier_organization_id');

    expect(GestorCarrierAuthorization::query()->count())->toBe(1);
});

test('store reactiva (in-place) una autorización previamente REVOCADA del mismo par, sin duplicar filas', function () {
    $gestor = gcaGestorOrganization();
    $carrier = gcaCarrierOrganization();
    $actor = gcaActor(['gestor_carrier_authorizations.create', 'gestor_carrier_authorizations.revoke'], $gestor->id);

    $created = $this->actingAs($actor)->postJson('/api/admin/gestor-carrier-authorizations', [
        'carrier_organization_id' => $carrier->id,
    ])->assertCreated();

    $authorizationId = $created->json('gestor_carrier_authorization.id');
    $this->actingAs($actor)->postJson("/api/admin/gestor-carrier-authorizations/{$authorizationId}/revoke")->assertOk();

    $this->actingAs($actor)->postJson('/api/admin/gestor-carrier-authorizations', [
        'carrier_organization_id' => $carrier->id,
    ])->assertCreated()->assertJsonPath('gestor_carrier_authorization.id', $authorizationId)
        ->assertJsonPath('gestor_carrier_authorization.is_active', true);

    expect(GestorCarrierAuthorization::query()->count())->toBe(1);
});

/**
 * (d) anti-IDOR: un tenant admin SIEMPRE autoriza desde SU PROPIA
 * organización -- `gestor_organization_id` enviado en el payload por un
 * actor NO platform-staff se IGNORA por completo (mismo criterio que
 * `TransportScheduleController::store()`). Si el actor pertenece a la
 * organización Transportadora e intenta "auto-autorizarse" enviando su
 * propia organización como `carrier_organization_id`, el guard de
 * `gestor === carrier` (forzado a su propio tenant) lo rechaza.
 */
test('store (d, anti-IDOR): un tenant admin NO puede inyectar un gestor_organization_id ajeno -- siempre se usa su propio tenant', function () {
    $gestor = gcaGestorOrganization();
    $otherGestor = gcaGestorOrganization();
    $carrier = gcaCarrierOrganization();
    $actor = gcaActor(['gestor_carrier_authorizations.create'], $gestor->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/gestor-carrier-authorizations', [
        'gestor_organization_id' => $otherGestor->id, // debe ignorarse -- no es platform staff
        'carrier_organization_id' => $carrier->id,
    ])->assertCreated();

    $response->assertJsonPath('gestor_carrier_authorization.gestor_organization_id', $gestor->id);
    expect(GestorCarrierAuthorization::query()->where('gestor_organization_id', $otherGestor->id)->exists())->toBeFalse();
});

test('store (d, anti-IDOR): el Transportador NO puede auto-autorizarse (gestor_organization_id forzado == carrier_organization_id)', function () {
    $carrier = gcaCarrierOrganization();
    // El actor pertenece a la organización Transportadora, no a un Gestor.
    $actor = gcaActor(['gestor_carrier_authorizations.create'], $carrier->id);

    $this->actingAs($actor)->postJson('/api/admin/gestor-carrier-authorizations', [
        'carrier_organization_id' => $carrier->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('carrier_organization_id');

    expect(GestorCarrierAuthorization::query()->count())->toBe(0);
});

test('store permite a platform staff indicar explícitamente gestor_organization_id', function () {
    $gestor = gcaGestorOrganization();
    $carrier = gcaCarrierOrganization();
    $actor = gcaPlatformStaffActor(['gestor_carrier_authorizations.create']);

    $this->actingAs($actor)->postJson('/api/admin/gestor-carrier-authorizations', [
        'gestor_organization_id' => $gestor->id,
        'carrier_organization_id' => $carrier->id,
    ])->assertCreated()->assertJsonPath('gestor_carrier_authorization.gestor_organization_id', $gestor->id);
});

// ---- revoke(): solo el Gestor dueño ----

test('revoke() marca is_active=false SIN borrar el registro (soft-delete/físico)', function () {
    $gestor = gcaGestorOrganization();
    $carrier = gcaCarrierOrganization();
    $actor = gcaActor(['gestor_carrier_authorizations.create', 'gestor_carrier_authorizations.revoke'], $gestor->id);

    $created = $this->actingAs($actor)->postJson('/api/admin/gestor-carrier-authorizations', [
        'carrier_organization_id' => $carrier->id,
    ])->assertCreated();

    $authorizationId = $created->json('gestor_carrier_authorization.id');

    $this->actingAs($actor)->postJson("/api/admin/gestor-carrier-authorizations/{$authorizationId}/revoke")
        ->assertOk()
        ->assertJsonPath('gestor_carrier_authorization.is_active', false);

    $authorization = GestorCarrierAuthorization::query()->findOrFail($authorizationId);
    expect($authorization->is_active)->toBeFalse()
        ->and($authorization->revoked_by)->toBe($actor->id)
        ->and($authorization->revoked_at)->not->toBeNull()
        ->and($authorization->trashed())->toBeFalse();
});

/**
 * (d) anti-IDOR: el Transportador autorizado (lado carrier, con acceso de
 * LECTURA vía isAccessibleBy()) NO puede revocar su propia autorización --
 * solo el Gestor dueño puede.
 */
test('revoke() (d, anti-IDOR): el Transportador autorizado NO puede revocar su propia autorización', function () {
    $gestor = gcaGestorOrganization();
    $carrier = gcaCarrierOrganization();
    $gestorActor = gcaActor(['gestor_carrier_authorizations.create'], $gestor->id);

    $created = $this->actingAs($gestorActor)->postJson('/api/admin/gestor-carrier-authorizations', [
        'carrier_organization_id' => $carrier->id,
    ])->assertCreated();

    $authorizationId = $created->json('gestor_carrier_authorization.id');
    $carrierActor = gcaActor(['gestor_carrier_authorizations.revoke'], $carrier->id);

    $this->actingAs($carrierActor)->postJson("/api/admin/gestor-carrier-authorizations/{$authorizationId}/revoke")
        ->assertForbidden();

    expect(GestorCarrierAuthorization::query()->findOrFail($authorizationId)->is_active)->toBeTrue();
});

test('revoke() rechaza revocar una autorización que YA está revocada', function () {
    $gestor = gcaGestorOrganization();
    $carrier = gcaCarrierOrganization();
    $actor = gcaActor(['gestor_carrier_authorizations.create', 'gestor_carrier_authorizations.revoke'], $gestor->id);

    $created = $this->actingAs($actor)->postJson('/api/admin/gestor-carrier-authorizations', [
        'carrier_organization_id' => $carrier->id,
    ])->assertCreated();

    $authorizationId = $created->json('gestor_carrier_authorization.id');
    $this->actingAs($actor)->postJson("/api/admin/gestor-carrier-authorizations/{$authorizationId}/revoke")->assertOk();

    $this->actingAs($actor)->postJson("/api/admin/gestor-carrier-authorizations/{$authorizationId}/revoke")
        ->assertUnprocessable();
});

// ---- index()/show(): acceso dual (Gestor Y Transportador) ----

test('show(): AMBOS lados (Gestor Y Transportador) pueden ver la autorización; un tercero recibe 403', function () {
    $gestor = gcaGestorOrganization();
    $carrier = gcaCarrierOrganization();
    $foreign = gcaGestorOrganization();

    $gestorActor = gcaActor(['gestor_carrier_authorizations.create', 'gestor_carrier_authorizations.read'], $gestor->id);
    $created = $this->actingAs($gestorActor)->postJson('/api/admin/gestor-carrier-authorizations', [
        'carrier_organization_id' => $carrier->id,
    ])->assertCreated();
    $authorizationId = $created->json('gestor_carrier_authorization.id');

    $carrierActor = gcaActor(['gestor_carrier_authorizations.read'], $carrier->id);
    $this->actingAs($carrierActor)->getJson("/api/admin/gestor-carrier-authorizations/{$authorizationId}")->assertOk();

    $foreignActor = gcaActor(['gestor_carrier_authorizations.read'], $foreign->id);
    $this->actingAs($foreignActor)->getJson("/api/admin/gestor-carrier-authorizations/{$authorizationId}")->assertForbidden();
});

test('index(): un Gestor ve las autorizaciones que ÉL otorgó; un Transportador ve las que le otorgaron', function () {
    $gestor = gcaGestorOrganization();
    $carrier = gcaCarrierOrganization();
    $gestorActor = gcaActor(['gestor_carrier_authorizations.create', 'gestor_carrier_authorizations.read'], $gestor->id);

    $this->actingAs($gestorActor)->postJson('/api/admin/gestor-carrier-authorizations', [
        'carrier_organization_id' => $carrier->id,
    ])->assertCreated();

    $viewGestor = $this->actingAs($gestorActor)->getJson('/api/admin/gestor-carrier-authorizations')->assertOk();
    expect($viewGestor->json('total'))->toBe(1);

    $carrierActor = gcaActor(['gestor_carrier_authorizations.read'], $carrier->id);
    $viewCarrier = $this->actingAs($carrierActor)->getJson('/api/admin/gestor-carrier-authorizations')->assertOk();
    expect($viewCarrier->json('total'))->toBe(1);

    $foreign = gcaGestorOrganization();
    $foreignActor = gcaActor(['gestor_carrier_authorizations.read'], $foreign->id);
    $viewForeign = $this->actingAs($foreignActor)->getJson('/api/admin/gestor-carrier-authorizations')->assertOk();
    expect($viewForeign->json('total'))->toBe(0);
});
