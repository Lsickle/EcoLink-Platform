<?php

use App\Models\Role;
use App\Models\SecurityLog;
use App\Models\User;
use App\Models\UserRole;

// RN-027/CU-006.7 (huevo-gallina): comando Artisan para dar el primer rol
// (ADMINISTRADOR) a un usuario real, ya que los endpoints HTTP de
// asignación de rol requieren `roles.assign` -- ver app/Console/Commands/AssignRoleCommand.php.

test('user:assign-role asigna el rol y registra el evento', function () {
    $user = User::factory()->create(['email' => 'admin@example.com']);
    $role = Role::factory()->create(['code' => 'ADMINISTRADOR']);

    $this->artisan('user:assign-role', ['email' => 'admin@example.com', 'role' => 'ADMINISTRADOR', '--force' => true])
        ->expectsOutputToContain('asignado correctamente')
        ->assertExitCode(0);

    expect(UserRole::query()->where('user_id', $user->id)->where('role_id', $role->id)->where('is_active', true)->exists())->toBeTrue();

    $log = SecurityLog::query()->where('event_type', 'ROLE_ASSIGNED_CONSOLE')->first();
    expect($log)->not->toBeNull()->and($log->user_id)->toBe($user->id);
});

test('user:assign-role acepta el código de rol en minúsculas', function () {
    $user = User::factory()->create(['email' => 'admin2@example.com']);
    $role = Role::factory()->create(['code' => 'ADMINISTRADOR']);

    $this->artisan('user:assign-role', ['email' => 'admin2@example.com', 'role' => 'administrador', '--force' => true])
        ->assertExitCode(0);

    expect(UserRole::query()->where('user_id', $user->id)->where('role_id', $role->id)->exists())->toBeTrue();
});

test('user:assign-role informa si el usuario no existe', function () {
    Role::factory()->create(['code' => 'ADMINISTRADOR']);

    $this->artisan('user:assign-role', ['email' => 'no-existe@example.com', 'role' => 'ADMINISTRADOR', '--force' => true])
        ->expectsOutputToContain('No se encontró ningún usuario')
        ->assertExitCode(1);
});

test('user:assign-role informa si el rol no existe', function () {
    User::factory()->create(['email' => 'admin3@example.com']);

    $this->artisan('user:assign-role', ['email' => 'admin3@example.com', 'role' => 'NO_EXISTE', '--force' => true])
        ->expectsOutputToContain('No se encontró ningún rol')
        ->assertExitCode(1);
});

test('user:assign-role no duplica la asignación si ya existe', function () {
    $user = User::factory()->create(['email' => 'admin4@example.com']);
    $role = Role::factory()->create(['code' => 'ADMINISTRADOR']);
    UserRole::query()->create(['user_id' => $user->id, 'role_id' => $role->id, 'is_active' => true]);

    $this->artisan('user:assign-role', ['email' => 'admin4@example.com', 'role' => 'ADMINISTRADOR', '--force' => true])
        ->expectsOutputToContain('ya tiene asignado')
        ->assertExitCode(0);

    expect(UserRole::query()->where('user_id', $user->id)->where('role_id', $role->id)->count())->toBe(1);
});

test('user:assign-role pide confirmación y no asigna si el usuario responde que no', function () {
    $user = User::factory()->create(['email' => 'admin5@example.com']);
    $role = Role::factory()->create(['code' => 'ADMINISTRADOR']);

    $this->artisan('user:assign-role', ['email' => 'admin5@example.com', 'role' => 'ADMINISTRADOR'])
        ->expectsConfirmation("¿Confirmas asignar el rol 'ADMINISTRADOR' al usuario 'admin5@example.com'?", 'no')
        ->assertExitCode(1);

    expect(UserRole::query()->where('user_id', $user->id)->where('role_id', $role->id)->exists())->toBeFalse();
});
