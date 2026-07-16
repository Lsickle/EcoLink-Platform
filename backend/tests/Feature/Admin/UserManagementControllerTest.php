<?php

use App\Models\Organization;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\SecurityLog;
use App\Models\User;
use App\Models\UserInvitation;
use App\Models\UserRole;
use App\Models\UserStatus;
use App\Notifications\PasswordRecoveryCodeNotification;
use App\Notifications\UserInvitationNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\PersonalAccessToken;

// CU-006 (Gestionar Usuarios) -- gateado por UserPolicy -> User::hasPermission()
// + aislamiento cross-tenant (hallazgo Crítico, especialista-seguridad 2026-07-13).
//
// Mecanismo de invitación (reemplaza el registro público, `password`/
// `password_confirmation`/`is_active_initial` eliminados de store(), ver
// UserManagementController): todo usuario nuevo nace PENDING_ACTIVATION.

beforeEach(function () {
    UserStatus::query()->firstOrCreate(['code' => 'ACTIVE'], ['name' => 'Activo', 'is_system' => true, 'is_active' => true]);
    UserStatus::query()->firstOrCreate(['code' => 'INACTIVE'], ['name' => 'Inactivo', 'is_system' => true, 'is_active' => true]);
    UserStatus::query()->firstOrCreate(['code' => 'PENDING_ACTIVATION'], ['name' => 'Pendiente de activación', 'is_system' => true, 'is_active' => true]);
});

function actingAsWithPermission(array $codes, ?int $tenantId = null): User
{
    $actor = User::factory()->create(['tenant_organization_id' => $tenantId]);
    $role = Role::factory()->create();

    foreach ($codes as $code) {
        // firstOrCreate: varios llamados en el mismo test piden el mismo
        // código (p. ej. 'users.deactivate' para dos admins distintos) --
        // `code` es UNIQUE, crear un Permission nuevo cada vez colisionaría.
        $permission = Permission::query()->firstOrCreate(['code' => $code], [
            'name' => $code, 'module' => explode('.', $code)[0], 'action' => explode('.', $code)[1] ?? $code,
            'scope' => 'tenant', 'is_system' => true, 'is_active' => true,
        ]);
        RolePermission::query()->create(['role_id' => $role->id, 'permission_id' => $permission->id, 'is_active' => true]);
    }

    UserRole::query()->create(['user_id' => $actor->id, 'role_id' => $role->id, 'is_active' => true]);

    return $actor;
}

function validUserPayload(array $overrides = []): array
{
    return array_merge([
        'first_name' => 'Carlos',
        'last_name' => 'Perez',
        'document_type' => 'CC',
        'document_number' => '900111222',
        'username' => 'carlos.perez',
        'email' => 'carlos.perez@example.com',
        'role_ids' => [],
    ], $overrides);
}

test('index rechaza sin users.read (403) y permite con el permiso (200)', function () {
    $withoutPermission = User::factory()->create();
    $this->actingAs($withoutPermission)->getJson('/api/admin/users')->assertForbidden();

    $withPermission = actingAsWithPermission(['users.read']);
    $this->actingAs($withPermission)->getJson('/api/admin/users')->assertOk();
});

test('store crea usuario+persona, asigna roles y registra auditoría (users.create)', function () {
    $actor = actingAsWithPermission(['users.create']);
    $role = Role::factory()->create();

    $response = $this->actingAs($actor)->postJson('/api/admin/users', validUserPayload(['role_ids' => [$role->id]]));

    $response->assertCreated()->assertJsonPath('user.username', 'carlos.perez');

    $user = User::query()->where('username', 'carlos.perez')->firstOrFail();
    expect($user->person)->not->toBeNull()
        ->and($user->person->document_number)->toBe('900111222')
        ->and(UserRole::query()->where('user_id', $user->id)->where('role_id', $role->id)->exists())->toBeTrue();

    $log = SecurityLog::query()->where('event_type', 'USER_CREATED_BY_ADMIN')->first();
    expect($log)->not->toBeNull()->and($log->user_id)->toBe($actor->id);
});

// ---- Mecanismo de invitación (reemplaza el registro público) ----

test('store crea el usuario en PENDING_ACTIVATION, con una fila user_invitations y despacha UserInvitationNotification', function () {
    Notification::fake();

    $actor = actingAsWithPermission(['users.create']);
    $role = Role::factory()->create();

    $this->actingAs($actor)->postJson('/api/admin/users', validUserPayload(['role_ids' => [$role->id]]))
        ->assertCreated()
        ->assertJsonPath('user.status.code', 'PENDING_ACTIVATION');

    $user = User::query()->where('username', 'carlos.perez')->firstOrFail();
    expect($user->status->code)->toBe('PENDING_ACTIVATION');

    $this->assertDatabaseHas('user_invitations', ['user_id' => $user->id]);

    Notification::assertSentTo($user, UserInvitationNotification::class);

    expect(SecurityLog::query()->where('event_type', 'USER_INVITED')->where('user_id', $actor->id)->exists())->toBeTrue();
});

test('resendInvitation reenvía la invitación, incrementa resend_count y registra auditoría', function () {
    Notification::fake();

    $pending = UserStatus::query()->where('code', 'PENDING_ACTIVATION')->firstOrFail();
    $target = User::factory()->create(['user_status_id' => $pending->id]);
    UserInvitation::issueFor($target);

    $actor = actingAsWithPermission(['users.create'], $target->tenant_organization_id);

    $this->actingAs($actor)->postJson("/api/admin/users/{$target->id}/resend-invitation")->assertOk();

    $row = DB::table('user_invitations')->where('user_id', $target->id)->first();
    expect($row->resend_count)->toBe(1);

    Notification::assertSentTo($target, UserInvitationNotification::class);
    expect(SecurityLog::query()->where('event_type', 'INVITATION_RESENT')->exists())->toBeTrue();
});

test('resendInvitation devuelve 422 si el usuario ya está ACTIVE (nada que reenviar)', function () {
    $target = User::factory()->create();

    $actor = actingAsWithPermission(['users.create'], $target->tenant_organization_id);

    $this->actingAs($actor)->postJson("/api/admin/users/{$target->id}/resend-invitation")
        ->assertUnprocessable()
        ->assertJsonValidationErrors('user');
});

test('resendInvitation deniega (403) sobre un usuario de OTRO tenant', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $pending = UserStatus::query()->where('code', 'PENDING_ACTIVATION')->firstOrFail();
    $target = User::factory()->create(['tenant_organization_id' => $orgB->id, 'user_status_id' => $pending->id]);

    $actor = actingAsWithPermission(['users.create'], $orgA->id);

    $this->actingAs($actor)->postJson("/api/admin/users/{$target->id}/resend-invitation")->assertForbidden();
});

test('store sin users.create devuelve 403 y no crea nada', function () {
    $actor = User::factory()->create();

    $this->actingAs($actor)->postJson('/api/admin/users', validUserPayload())->assertForbidden();

    expect(User::query()->where('username', 'carlos.perez')->exists())->toBeFalse();
});

test('store exige al menos un rol (RN-027)', function () {
    $actor = actingAsWithPermission(['users.create']);

    $this->actingAs($actor)->postJson('/api/admin/users', validUserPayload(['role_ids' => []]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('role_ids');
});

test('show/update respetan users.read/users.update', function () {
    $target = User::factory()->create();

    $noPermission = User::factory()->create();
    $this->actingAs($noPermission)->getJson("/api/admin/users/{$target->id}")->assertForbidden();
    $this->actingAs($noPermission)->putJson("/api/admin/users/{$target->id}", ['email' => 'nuevo@example.com'])->assertForbidden();

    $reader = actingAsWithPermission(['users.read']);
    $this->actingAs($reader)->getJson("/api/admin/users/{$target->id}")->assertOk();

    $editor = actingAsWithPermission(['users.update']);
    $this->actingAs($editor)->putJson("/api/admin/users/{$target->id}", ['email' => 'nuevo@example.com'])
        ->assertOk()
        ->assertJsonPath('user.email', 'nuevo@example.com');
});

test('activate respeta users.activate y deactivate respeta users.deactivate por separado (hallazgo Medio, mínimo privilegio)', function () {
    $target = User::factory()->create();
    $token = $target->createToken('device')->plainTextToken;
    expect(PersonalAccessToken::query()->count())->toBe(1);

    $noPermission = User::factory()->create();
    $this->actingAs($noPermission)->postJson("/api/admin/users/{$target->id}/deactivate")->assertForbidden();

    // users.activate NO alcanza para deactivate() -- permisos separados.
    $onlyActivate = actingAsWithPermission(['users.activate']);
    $this->actingAs($onlyActivate)->postJson("/api/admin/users/{$target->id}/deactivate")->assertForbidden();

    $deactivator = actingAsWithPermission(['users.deactivate']);
    $this->actingAs($deactivator)->postJson("/api/admin/users/{$target->id}/deactivate")->assertOk();

    $target->refresh();
    expect($target->is_active)->toBeFalse()
        ->and($target->status->code)->toBe('INACTIVE')
        // CU-006.4 paso 5: revoca tokens activos al inactivar.
        ->and(PersonalAccessToken::query()->count())->toBe(0);

    $activator = actingAsWithPermission(['users.activate']);
    $this->actingAs($activator)->postJson("/api/admin/users/{$target->id}/activate")->assertOk();

    $target->refresh();
    expect($target->is_active)->toBeTrue()
        ->and($target->status->code)->toBe('ACTIVE');

    expect(SecurityLog::query()->where('event_type', 'USER_DEACTIVATED')->exists())->toBeTrue()
        ->and(SecurityLog::query()->where('event_type', 'USER_ACTIVATED')->exists())->toBeTrue();
});

test('deactivate borra también las filas de sessions del usuario (hallazgo Alto, SESSION_DRIVER=database)', function () {
    $target = User::factory()->create();

    DB::table('sessions')->insert([
        'id' => 'sess-1',
        'user_id' => $target->id,
        'payload' => base64_encode('x'),
        'last_activity' => time(),
    ]);

    $actor = actingAsWithPermission(['users.deactivate']);
    $this->actingAs($actor)->postJson("/api/admin/users/{$target->id}/deactivate")->assertOk();

    expect(DB::table('sessions')->where('user_id', $target->id)->exists())->toBeFalse();
});

// ---- Hallazgo Crítico (especialista-seguridad, 2026-07-13): aislamiento cross-tenant ----

test('store fija tenant_organization_id del actor, nunca del cliente', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();
    $actor = actingAsWithPermission(['users.create'], $orgA->id);
    $role = Role::factory()->create();

    $this->actingAs($actor)->postJson('/api/admin/users', validUserPayload([
        'role_ids' => [$role->id],
        // un cliente malicioso intenta colarse en el tenant de otra organización.
        'tenant_organization_id' => $orgB->id,
    ]))->assertCreated();

    $user = User::query()->where('username', 'carlos.perez')->firstOrFail();
    expect($user->tenant_organization_id)->toBe($orgA->id);
});

test('store rechaza role_ids que pertenecen a OTRO tenant (422) -- hallazgo Crítico, role smuggling cross-tenant', function () {
    // Hallazgo Crítico (especialista-seguridad, 2026-07-14):
    // UserProvisioningService::createPendingUser() solo validaba
    // `role_ids.*` con `exists:roles,id` (existencia global), sin
    // comprobar `Role::isAccessibleBy($actor)` -- un admin de un tenant
    // podía crear un usuario en su propio tenant y asignarle un rol
    // personalizado de OTRO tenant, obteniendo permisos efectivos de una
    // organización ajena.
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();
    $actor = actingAsWithPermission(['users.create'], $orgA->id);
    $roleOtherTenant = Role::factory()->create(['tenant_organization_id' => $orgB->id]);

    $this->actingAs($actor)->postJson('/api/admin/users', validUserPayload(['role_ids' => [$roleOtherTenant->id]]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('role_ids');

    expect(User::query()->where('username', 'carlos.perez')->exists())->toBeFalse();
});

test('index solo lista usuarios del mismo tenant que el actor', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $userA = User::factory()->create(['tenant_organization_id' => $orgA->id]);
    $userB = User::factory()->create(['tenant_organization_id' => $orgB->id]);

    $actor = actingAsWithPermission(['users.read'], $orgA->id);

    $response = $this->actingAs($actor)->getJson('/api/admin/users')->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($userA->id)
        ->and($ids)->not->toContain($userB->id);
});

test('show/update/activate/deactivate DENIEGAN (403) sobre un usuario de OTRO tenant', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $targetOtherTenant = User::factory()->create(['tenant_organization_id' => $orgB->id]);

    $reader = actingAsWithPermission(['users.read'], $orgA->id);
    $this->actingAs($reader)->getJson("/api/admin/users/{$targetOtherTenant->id}")->assertForbidden();

    $editor = actingAsWithPermission(['users.update'], $orgA->id);
    $this->actingAs($editor)->putJson("/api/admin/users/{$targetOtherTenant->id}", ['email' => 'x@example.com'])->assertForbidden();

    $activator = actingAsWithPermission(['users.activate'], $orgA->id);
    $this->actingAs($activator)->postJson("/api/admin/users/{$targetOtherTenant->id}/activate")->assertForbidden();

    $deactivator = actingAsWithPermission(['users.deactivate'], $orgA->id);
    $this->actingAs($deactivator)->postJson("/api/admin/users/{$targetOtherTenant->id}/deactivate")->assertForbidden();
});

// ---- Hallazgo Alto (especialista-seguridad, 2026-07-13): último admin del tenant ----

test('deactivate bloquea la auto-desactivación cuando el actor es el único con users.deactivate en su tenant', function () {
    $orgA = Organization::factory()->create();
    $actor = actingAsWithPermission(['users.deactivate'], $orgA->id);

    $this->actingAs($actor)->postJson("/api/admin/users/{$actor->id}/deactivate")
        ->assertUnprocessable()
        ->assertJsonValidationErrors('user');

    expect($actor->fresh()->is_active)->toBeTrue();
});

test('deactivate SÍ permite la acción cuando existe otro usuario activo con users.deactivate en el tenant', function () {
    $orgA = Organization::factory()->create();
    $actor = actingAsWithPermission(['users.deactivate'], $orgA->id);
    $otherAdmin = actingAsWithPermission(['users.deactivate'], $orgA->id);

    $this->actingAs($actor)->postJson("/api/admin/users/{$otherAdmin->id}/deactivate")->assertOk();

    expect($otherAdmin->fresh()->is_active)->toBeFalse();
});

test('deactivate NO cuenta administradores de OTRO tenant como "otro admin disponible"', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $actor = actingAsWithPermission(['users.deactivate'], $orgA->id);
    actingAsWithPermission(['users.deactivate'], $orgB->id); // admin de OTRO tenant, no debe contar.

    $this->actingAs($actor)->postJson("/api/admin/users/{$actor->id}/deactivate")
        ->assertUnprocessable();
});

// ---- Lote de cierre de brecha con Figma (2026-07-14): filtros de index() ----

test('index filtra por search (nombre completo de person, email o username)', function () {
    $actor = actingAsWithPermission(['users.read']);

    $matchByName = User::factory()->create(['username' => 'aaa.zzz', 'email' => 'aaa@example.com']);
    $matchByName->person->update(['first_name' => 'Marcela', 'last_name' => 'Buscador']);

    $matchByEmail = User::factory()->create(['username' => 'bbb.zzz', 'email' => 'buscador@example.com']);
    $matchByUsername = User::factory()->create(['username' => 'buscador.ccc', 'email' => 'ccc@example.com']);
    $noise = User::factory()->create(['username' => 'ddd.eee', 'email' => 'ddd@example.com']);

    $response = $this->actingAs($actor)->getJson('/api/admin/users?search=buscador')->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($matchByName->id)
        ->and($ids)->toContain($matchByEmail->id)
        ->and($ids)->toContain($matchByUsername->id)
        ->and($ids)->not->toContain($noise->id);
});

test('index filtra por status (código de UserStatus)', function () {
    $actor = actingAsWithPermission(['users.read']);

    $inactiveStatus = UserStatus::query()->where('code', 'INACTIVE')->firstOrFail();
    User::factory()->create(['username' => 'activo.status.test']);
    User::factory()->create(['username' => 'inactivo.status.test', 'user_status_id' => $inactiveStatus->id]);

    $response = $this->actingAs($actor)->getJson('/api/admin/users?status=INACTIVE')->assertOk();

    $usernames = collect($response->json('data'))->pluck('username');
    expect($usernames)->toContain('inactivo.status.test')->not->toContain('activo.status.test');
});

test('index filtra por role (código de rol, solo asignaciones ACTIVAS en user_roles)', function () {
    $actor = actingAsWithPermission(['users.read']);

    $role = Role::factory()->create(['code' => 'ROL_FILTRO_INDEX_TEST']);
    $withRole = User::factory()->create(['username' => 'con.rol.test']);
    UserRole::query()->create(['user_id' => $withRole->id, 'role_id' => $role->id, 'is_active' => true]);

    $withInactiveRole = User::factory()->create(['username' => 'con.rol.inactivo.test']);
    UserRole::query()->create(['user_id' => $withInactiveRole->id, 'role_id' => $role->id, 'is_active' => false]);

    User::factory()->create(['username' => 'sin.rol.test']);

    $response = $this->actingAs($actor)->getJson('/api/admin/users?role=ROL_FILTRO_INDEX_TEST')->assertOk();

    $usernames = collect($response->json('data'))->pluck('username');
    expect($usernames)->toContain('con.rol.test')
        ->not->toContain('con.rol.inactivo.test')
        ->not->toContain('sin.rol.test');
});

test('index ordena por sort/direction (whitelist: username, created_at) e ignora columnas fuera de la whitelist', function () {
    $actor = actingAsWithPermission(['users.read']);

    User::factory()->create(['username' => 'zzz.orden.test']);
    User::factory()->create(['username' => 'aaa.orden.test']);

    $asc = collect($this->actingAs($actor)->getJson('/api/admin/users?sort=username&direction=asc')->assertOk()->json('data'))->pluck('username')->values();
    expect($asc->first())->toBe('aaa.orden.test');

    $desc = collect($this->actingAs($actor)->getJson('/api/admin/users?sort=username&direction=desc')->assertOk()->json('data'))->pluck('username')->values();
    expect($desc->first())->toBe('zzz.orden.test');

    // columna fuera de la whitelist -- no debe fallar ni permitir SQL injection vía nombre de columna.
    $this->actingAs($actor)->getJson('/api/admin/users?sort=1)); DROP TABLE users; --')->assertOk();
});

test('index combina search + status + role a la vez', function () {
    $actor = actingAsWithPermission(['users.read']);
    $role = Role::factory()->create(['code' => 'ROL_COMBINADO_INDEX_TEST']);
    $inactiveStatus = UserStatus::query()->where('code', 'INACTIVE')->firstOrFail();

    $match = User::factory()->create(['username' => 'combinado.match', 'email' => 'combinado@example.com']);
    UserRole::query()->create(['user_id' => $match->id, 'role_id' => $role->id, 'is_active' => true]);

    $wrongStatus = User::factory()->create(['username' => 'combinado.wrongstatus', 'email' => 'combinado2@example.com', 'user_status_id' => $inactiveStatus->id]);
    UserRole::query()->create(['user_id' => $wrongStatus->id, 'role_id' => $role->id, 'is_active' => true]);

    User::factory()->create(['username' => 'combinado.wrongrole', 'email' => 'combinado3@example.com']);

    $response = $this->actingAs($actor)
        ->getJson('/api/admin/users?search=combinado&status=ACTIVE&role=ROL_COMBINADO_INDEX_TEST')
        ->assertOk();

    $usernames = collect($response->json('data'))->pluck('username');
    expect($usernames)->toContain('combinado.match')
        ->not->toContain('combinado.wrongstatus')
        ->not->toContain('combinado.wrongrole');
});

// ---- Lote de cierre de brecha con Figma: show() resuelve created_by/updated_by ----

test('show resuelve created_by/updated_by a {id, username} (paridad con RoleController::show())', function () {
    $creator = User::factory()->create(['username' => 'user_creador_test']);
    $target = User::factory()->create(['created_by' => $creator->id, 'updated_by' => $creator->id]);

    $actor = actingAsWithPermission(['users.read'], $target->tenant_organization_id);

    $response = $this->actingAs($actor)->getJson("/api/admin/users/{$target->id}")->assertOk();

    $response->assertJsonPath('user.created_by.id', $creator->id)
        ->assertJsonPath('user.created_by.username', 'user_creador_test')
        ->assertJsonPath('user.updated_by.id', $creator->id)
        ->assertJsonPath('user.updated_by.username', 'user_creador_test');
});

test('store fija created_by/updated_by del actor autenticado; update() actualiza updated_by (nunca created_by)', function () {
    $actor = actingAsWithPermission(['users.create', 'users.update']);
    $role = Role::factory()->create();

    $response = $this->actingAs($actor)->postJson('/api/admin/users', validUserPayload(['role_ids' => [$role->id]]))->assertCreated();
    $user = User::query()->findOrFail($response->json('user.id'));

    expect($user->created_by)->toBe($actor->id)->and($user->updated_by)->toBe($actor->id);

    $otherActor = actingAsWithPermission(['users.update'], $actor->tenant_organization_id);
    $this->actingAs($otherActor)->putJson("/api/admin/users/{$user->id}", ['email' => 'actualizado@example.com'])->assertOk();

    expect($user->fresh()->updated_by)->toBe($otherActor->id)
        ->and($user->fresh()->created_by)->toBe($actor->id);
});

// ---- Lote de cierre de brecha con Figma: POST /admin/users/{user}/roles/{role}/revoke ----

test('revokeRole revoca un rol activo (dejando al menos uno restante) y registra auditoría', function () {
    $target = User::factory()->create();
    $roleA = Role::factory()->create();
    $roleB = Role::factory()->create();
    UserRole::query()->create(['user_id' => $target->id, 'role_id' => $roleA->id, 'is_active' => true]);
    UserRole::query()->create(['user_id' => $target->id, 'role_id' => $roleB->id, 'is_active' => true]);

    $actor = actingAsWithPermission(['roles.assign'], $target->tenant_organization_id);

    $this->actingAs($actor)->postJson("/api/admin/users/{$target->id}/roles/{$roleA->id}/revoke")->assertOk();

    expect(UserRole::query()->where('user_id', $target->id)->where('role_id', $roleA->id)->first()->is_active)->toBeFalse()
        ->and(UserRole::query()->where('user_id', $target->id)->where('role_id', $roleB->id)->first()->is_active)->toBeTrue();

    expect(SecurityLog::query()->where('event_type', 'ROLE_REVOKED')->exists())->toBeTrue();
});

test('revokeRole devuelve 422 si es el único rol activo del usuario (RN-027)', function () {
    $target = User::factory()->create();
    $onlyRole = Role::factory()->create();
    UserRole::query()->create(['user_id' => $target->id, 'role_id' => $onlyRole->id, 'is_active' => true]);

    $actor = actingAsWithPermission(['roles.assign'], $target->tenant_organization_id);

    $this->actingAs($actor)->postJson("/api/admin/users/{$target->id}/roles/{$onlyRole->id}/revoke")
        ->assertUnprocessable()
        ->assertJsonValidationErrors('role');

    expect(UserRole::query()->where('user_id', $target->id)->where('role_id', $onlyRole->id)->first()->is_active)->toBeTrue();
});

test('revokeRole aisla cross-tenant (422) cuando el USUARIO objetivo pertenece a OTRO tenant', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $roleA = Role::factory()->create();
    $roleB = Role::factory()->create();
    $target = User::factory()->create(['tenant_organization_id' => $orgB->id]);
    UserRole::query()->create(['user_id' => $target->id, 'role_id' => $roleA->id, 'is_active' => true]);
    UserRole::query()->create(['user_id' => $target->id, 'role_id' => $roleB->id, 'is_active' => true]);

    $actor = actingAsWithPermission(['roles.assign'], $orgA->id);

    $this->actingAs($actor)->postJson("/api/admin/users/{$target->id}/roles/{$roleA->id}/revoke")
        ->assertUnprocessable()
        ->assertJsonValidationErrors('user');
});

test('revokeRole aisla cross-tenant (422) cuando el ROL pertenece a OTRO tenant', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $roleOtherTenant = Role::factory()->create(['tenant_organization_id' => $orgB->id]);
    $target = User::factory()->create(['tenant_organization_id' => $orgA->id]);
    UserRole::query()->create(['user_id' => $target->id, 'role_id' => $roleOtherTenant->id, 'is_active' => true]);

    $actor = actingAsWithPermission(['roles.assign'], $orgA->id);

    $this->actingAs($actor)->postJson("/api/admin/users/{$target->id}/roles/{$roleOtherTenant->id}/revoke")
        ->assertUnprocessable()
        ->assertJsonValidationErrors('role');
});

test('revokeRole sin roles.assign devuelve 403', function () {
    $target = User::factory()->create();
    $role = Role::factory()->create();
    UserRole::query()->create(['user_id' => $target->id, 'role_id' => $role->id, 'is_active' => true]);

    $actor = User::factory()->create(['tenant_organization_id' => $target->tenant_organization_id]);
    $this->actingAs($actor)->postJson("/api/admin/users/{$target->id}/roles/{$role->id}/revoke")->assertForbidden();
});

// ---- Lote de cierre de brecha con Figma: POST /admin/users/{user}/reset-password ----

test('resetPassword dispara el mecanismo OTP hacia el correo del usuario OBJETIVO (no del admin) y registra auditoría distinta al autoservicio', function () {
    Notification::fake();

    $target = User::factory()->create(['email' => 'objetivo.reset@example.com']);
    $actor = actingAsWithPermission(['users.reset-password'], $target->tenant_organization_id);

    $this->actingAs($actor)->postJson("/api/admin/users/{$target->id}/reset-password")->assertOk();

    $row = DB::table('password_reset_tokens')->where('email', 'objetivo.reset@example.com')->first();
    expect($row)->not->toBeNull();

    Notification::assertSentTo($target, PasswordRecoveryCodeNotification::class);
    Notification::assertNotSentTo($actor, PasswordRecoveryCodeNotification::class);

    $log = SecurityLog::query()->where('event_type', 'PASSWORD_RESET_BY_ADMIN')->first();
    expect($log)->not->toBeNull()
        ->and($log->user_id)->toBe($actor->id)
        ->and($log->metadata['target_user_id'])->toBe($target->id);
});

test('resetPassword aisla cross-tenant (403) sobre un usuario de OTRO tenant', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $target = User::factory()->create(['tenant_organization_id' => $orgB->id]);
    $actor = actingAsWithPermission(['users.reset-password'], $orgA->id);

    $this->actingAs($actor)->postJson("/api/admin/users/{$target->id}/reset-password")->assertForbidden();
});

test('resetPassword sin users.reset-password devuelve 403', function () {
    $target = User::factory()->create();
    $actor = User::factory()->create(['tenant_organization_id' => $target->tenant_organization_id]);

    $this->actingAs($actor)->postJson("/api/admin/users/{$target->id}/reset-password")->assertForbidden();
});

// Hallazgo Medio (especialista-seguridad, 2026-07-14): sin rate limiting,
// un admin malicioso (o con sesión comprometida) podía spamear el buzón OTP
// de un usuario objetivo, o "grief-ear" un reset de autoservicio legítimo en
// curso -- ver AppServiceProvider::configureRateLimiting() (limiter
// 'admin-password-reset', mismo estilo que AuthRateLimitTest.php).

test('resetPassword aplica rate limiting (5/min por actor+usuario objetivo) -- hallazgo Medio', function () {
    Notification::fake();

    $target = User::factory()->create();
    $actor = actingAsWithPermission(['users.reset-password'], $target->tenant_organization_id);

    foreach (range(1, 5) as $i) {
        $this->actingAs($actor)->postJson("/api/admin/users/{$target->id}/reset-password")->assertOk();
    }

    $this->actingAs($actor)->postJson("/api/admin/users/{$target->id}/reset-password")->assertStatus(429);
});

test('resetPassword sigue permitiendo un usuario objetivo distinto tras agotar el balde de otro (clave por actor+objetivo)', function () {
    Notification::fake();

    $tenantId = Organization::factory()->create()->id;
    $actor = actingAsWithPermission(['users.reset-password'], $tenantId);
    $targetA = User::factory()->create(['tenant_organization_id' => $tenantId]);
    $targetB = User::factory()->create(['tenant_organization_id' => $tenantId]);

    foreach (range(1, 5) as $i) {
        $this->actingAs($actor)->postJson("/api/admin/users/{$targetA->id}/reset-password")->assertOk();
    }
    $this->actingAs($actor)->postJson("/api/admin/users/{$targetA->id}/reset-password")->assertStatus(429);

    // Mismo actor, usuario objetivo distinto -> balde independiente (clave actor+objetivo).
    $this->actingAs($actor)->postJson("/api/admin/users/{$targetB->id}/reset-password")->assertOk();
});

// ---- Lote de cierre de brecha con Figma: GET /admin/users/{user}/activity ----

test('activity devuelve varios tipos de evento relacionados al usuario objetivo, ordenados desc', function () {
    Notification::fake();

    $actor = actingAsWithPermission([
        'users.create', 'users.update', 'users.activate', 'users.deactivate',
        'users.reset-password', 'roles.assign', 'audit.read',
    ]);
    $roleA = Role::factory()->create();
    $roleB = Role::factory()->create();

    $created = $this->actingAs($actor)->postJson('/api/admin/users', validUserPayload(['role_ids' => [$roleA->id]]))->assertCreated();
    $target = User::query()->findOrFail($created->json('user.id'));

    $this->actingAs($actor)->putJson("/api/admin/users/{$target->id}", ['email' => 'actividad@example.com'])->assertOk();
    $this->actingAs($actor)->postJson("/api/admin/users/{$target->id}/deactivate")->assertOk();
    $this->actingAs($actor)->postJson("/api/admin/users/{$target->id}/activate")->assertOk();
    $this->actingAs($actor)->postJson("/api/admin/users/{$target->id}/reset-password")->assertOk();
    $this->actingAs($actor)->postJson("/api/admin/roles/{$roleB->id}/assign", ['user_id' => $target->id])->assertOk();
    $this->actingAs($actor)->postJson("/api/admin/users/{$target->id}/roles/{$roleA->id}/revoke")->assertOk();

    // ruido: evento de OTRO usuario -- no debe aparecer.
    $other = User::factory()->create(['tenant_organization_id' => $target->tenant_organization_id]);
    $this->actingAs($actor)->putJson("/api/admin/users/{$other->id}", ['email' => 'ruido@example.com'])->assertOk();

    $response = $this->actingAs($actor)->getJson("/api/admin/users/{$target->id}/activity")->assertOk();

    $events = collect($response->json('data'))->pluck('event_type');
    expect($events)->toContain('USER_CREATED_BY_ADMIN')
        ->and($events)->toContain('USER_INVITED')
        ->and($events)->toContain('USER_UPDATED_BY_ADMIN')
        ->and($events)->toContain('USER_DEACTIVATED')
        ->and($events)->toContain('USER_ACTIVATED')
        ->and($events)->toContain('PASSWORD_RESET_BY_ADMIN')
        ->and($events)->toContain('ROLE_ASSIGNED')
        ->and($events)->toContain('ROLE_REVOKED');

    $first = collect($response->json('data'))->first();
    expect($first)->toHaveKeys(['event_type', 'description', 'actor', 'created_at'])
        ->and($first['actor']['id'])->toBe($actor->id);
});

test('activity incluye INVITATION_ACCEPTED, filtrado por security_logs.user_id (no por metadata -- inconsistencia documentada)', function () {
    Notification::fake();

    $pending = UserStatus::query()->where('code', 'PENDING_ACTIVATION')->firstOrFail();
    $target = User::factory()->create(['user_status_id' => $pending->id]);
    $token = UserInvitation::issueFor($target);

    $this->postJson('/api/invitations/accept', [
        'token' => $token,
        'password' => 'NuevaClave123',
        'password_confirmation' => 'NuevaClave123',
    ])->assertOk();

    $actor = actingAsWithPermission(['audit.read'], $target->tenant_organization_id);

    $response = $this->actingAs($actor)->getJson("/api/admin/users/{$target->id}/activity")->assertOk();

    expect(collect($response->json('data'))->pluck('event_type'))->toContain('INVITATION_ACCEPTED');
});

test('activity responde 403 sin permiso audit.read', function () {
    $target = User::factory()->create();
    $noPermission = User::factory()->create(['tenant_organization_id' => $target->tenant_organization_id]);

    $this->actingAs($noPermission)->getJson("/api/admin/users/{$target->id}/activity")->assertForbidden();
});

test('activity responde 422 (aislamiento cross-tenant) cuando el usuario pertenece a OTRO tenant', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $target = User::factory()->create(['tenant_organization_id' => $orgB->id]);
    $actor = actingAsWithPermission(['audit.read'], $orgA->id);

    $this->actingAs($actor)->getJson("/api/admin/users/{$target->id}/activity")->assertUnprocessable();
});
