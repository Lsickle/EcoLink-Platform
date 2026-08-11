<?php

use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserRole;
use App\Models\UserStatus;

// Cambio de contraseña obligatorio en el primer login (confirmado por el
// usuario, 2026-08-11) -- hallazgo Alto de la revisión de seguridad de la
// Carga Masiva de Generadores: `UserProvisioningService::createActiveAdminForOrganization()`
// crea usuarios ACTIVE con una contraseña real generada, sin ningún
// mecanismo que fuerce cambiarla. Ver docblock de `EnsureUserIsActive` y
// `AuthController::changePassword()` para el diseño completo.

beforeEach(function () {
    UserStatus::query()->firstOrCreate(['code' => 'ACTIVE'], ['name' => 'Activo', 'is_system' => true, 'is_active' => true]);
});

function mcpUser(bool $mustChangePassword, string $password = 'Passw0rd123'): User
{
    return User::factory()->create([
        'must_change_password' => $mustChangePassword,
        'password_hash' => $password,
    ]);
}

/**
 * Con permiso `users.read` real -- para probar el gate de este middleware
 * de forma inequívoca, sin confundirlo con un 403 que vendría de la Policy
 * por falta de permiso (`User::factory()` sin rol nunca pasaría
 * `UserPolicy`, así que una ruta admin cualquiera no sirve para aislar el
 * comportamiento de `EnsureUserIsActive` por sí solo).
 */
function mcpUserWithUsersReadPermission(bool $mustChangePassword, string $password = 'Passw0rd123'): User
{
    $user = mcpUser($mustChangePassword, $password);
    $role = Role::factory()->create();
    $permission = Permission::query()->firstOrCreate(['code' => 'users.read'], [
        'name' => 'users.read', 'module' => 'users', 'action' => 'read', 'scope' => 'tenant', 'is_system' => true, 'is_active' => true,
    ]);
    RolePermission::query()->create(['role_id' => $role->id, 'permission_id' => $permission->id, 'is_active' => true]);
    UserRole::query()->create(['user_id' => $user->id, 'role_id' => $role->id, 'is_active' => true]);

    return $user;
}

// ---- EnsureUserIsActive: allow-list mientras el flag está activo ----

test('con must_change_password=true, GET /api/user sigue siendo accesible', function () {
    $user = mcpUser(true);

    $this->actingAs($user)->getJson('/api/user')->assertOk();
});

test('con must_change_password=true, POST /api/logout sigue siendo accesible', function () {
    // `actingAs()` deja el request sin sesión real montada -- `logout()`
    // llama `$request->session()`, que exige el ciclo de sesión completo.
    // Se autentica con un login real (mismo criterio que AuthTest.php >
    // "web login (sin device_name) autentica por sesión") en vez de
    // `actingAs()` para este caso puntual.
    $user = mcpUser(true);

    $this->withHeaders(['Referer' => 'http://localhost:3000'])
        ->postJson('/api/login', ['login' => $user->username, 'password' => 'Passw0rd123'])
        ->assertOk();

    $this->postJson('/api/logout')->assertOk();
});

test('con must_change_password=true, PUT /api/password sigue siendo accesible', function () {
    $user = mcpUser(true);

    $this->actingAs($user)->putJson('/api/password', [
        'current_password' => 'Passw0rd123',
        'password' => 'NewPassw0rd456',
        'password_confirmation' => 'NewPassw0rd456',
    ])->assertOk();
});

test('con must_change_password=true, cualquier otra ruta autenticada recibe 403 con el mensaje del gate (no de la Policy)', function () {
    $user = mcpUserWithUsersReadPermission(true);

    $this->actingAs($user)->getJson('/api/admin/users')
        ->assertForbidden()
        ->assertJsonPath('message', 'Debe cambiar su contraseña antes de continuar.');
});

test('con must_change_password=false (caso normal), ninguna ruta queda bloqueada por este gate', function () {
    $user = mcpUserWithUsersReadPermission(false);

    $this->actingAs($user)->getJson('/api/admin/users')->assertOk();
});

// ---- changePassword() limpia el flag ----

test('changePassword() limpia must_change_password=false tras un cambio exitoso', function () {
    $user = mcpUser(true);

    $this->actingAs($user)->putJson('/api/password', [
        'current_password' => 'Passw0rd123',
        'password' => 'NewPassw0rd456',
        'password_confirmation' => 'NewPassw0rd456',
    ])->assertOk();

    expect($user->refresh()->must_change_password)->toBeFalse();
});

test('changePassword() con contraseña actual incorrecta NO limpia el flag', function () {
    $user = mcpUser(true);

    $this->actingAs($user)->putJson('/api/password', [
        'current_password' => 'incorrecta',
        'password' => 'NewPassw0rd456',
        'password_confirmation' => 'NewPassw0rd456',
    ])->assertUnprocessable();

    expect($user->refresh()->must_change_password)->toBeTrue();
});

// ---- Flujo completo: bloqueado -> cambia -> desbloqueado ----

test('flujo completo: bloqueado en una ruta normal, cambia contraseña, queda desbloqueado sin nueva sesión', function () {
    $user = mcpUserWithUsersReadPermission(true);

    $this->actingAs($user)->getJson('/api/admin/users')->assertForbidden();

    $this->actingAs($user)->putJson('/api/password', [
        'current_password' => 'Passw0rd123',
        'password' => 'NewPassw0rd456',
        'password_confirmation' => 'NewPassw0rd456',
    ])->assertOk();

    $user->refresh();
    expect($user->must_change_password)->toBeFalse();

    $this->actingAs($user)->getJson('/api/admin/users')->assertOk();
});

test('GET /api/user expone must_change_password en la respuesta', function () {
    $user = mcpUser(true);

    $this->actingAs($user)->getJson('/api/user')
        ->assertOk()
        ->assertJsonPath('user.must_change_password', true);
});
