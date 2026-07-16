<?php

use App\Models\Organization;
use App\Models\PasswordHistory;
use App\Models\Role;
use App\Models\User;
use App\Models\UserRole;
use App\Models\UserStatus;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\PlatformOrganizationSeeder;
use Illuminate\Support\Facades\Hash;

// Mecanismo de invitación (reemplaza el registro público): sin ningún admin
// sembrado, no hay quien invite al primer usuario -- bootstrap de consola,
// ver app/Console/Commands/CreateAdminCommand.php.
//
// Hallazgo Alto (especialista-seguridad, 2026-07-14): el admin bootstrapeado
// debe quedar en la organización PLATAFORMA para poder gestionar la cola de
// solicitudes de invitación desde el día uno -- ver User::isPlatformStaff().

beforeEach(function () {
    UserStatus::query()->firstOrCreate(['code' => 'ACTIVE'], ['name' => 'Activo', 'is_system' => true, 'is_active' => true]);
    Role::query()->firstOrCreate(['code' => 'ADMINISTRADOR'], ['name' => 'Administrador', 'is_system' => true, 'is_active' => true]);
    $this->seed(OrganizationStatusSeeder::class);
    $this->seed(PlatformOrganizationSeeder::class);
});

test('user:create-admin crea el administrador con la password explícita provista', function () {
    $this->artisan('user:create-admin', ['email' => 'admin@ejemplo.com', '--password' => 'Passw0rd123', '--force' => true])
        ->expectsOutputToContain('creado correctamente')
        ->assertExitCode(0);

    $user = User::query()->where('email', 'admin@ejemplo.com')->firstOrFail();

    expect($user->status->code)->toBe('ACTIVE')
        ->and(Hash::check('Passw0rd123', $user->password_hash))->toBeTrue()
        ->and(PasswordHistory::query()->where('user_id', $user->id)->exists())->toBeTrue();

    $role = Role::query()->where('code', 'ADMINISTRADOR')->firstOrFail();
    expect(UserRole::query()->where('user_id', $user->id)->where('role_id', $role->id)->where('is_active', true)->exists())->toBeTrue();
});

test('user:create-admin asigna tenant_organization_id a la organización plataforma', function () {
    $this->artisan('user:create-admin', ['email' => 'admin-platform@ejemplo.com', '--password' => 'Passw0rd123', '--force' => true])
        ->assertExitCode(0);

    $user = User::query()->where('email', 'admin-platform@ejemplo.com')->firstOrFail();
    $platform = Organization::query()->where('tax_id', PlatformOrganizationSeeder::PLATFORM_TAX_ID)->firstOrFail();

    expect($user->tenant_organization_id)->toBe($platform->id)
        ->and($user->isPlatformStaff())->toBeTrue();
});

test('user:create-admin falla con mensaje claro si la organización plataforma no está sembrada', function () {
    Organization::query()->where('tax_id', PlatformOrganizationSeeder::PLATFORM_TAX_ID)->forceDelete();

    $this->artisan('user:create-admin', ['email' => 'admin-sin-plataforma@ejemplo.com', '--password' => 'Passw0rd123', '--force' => true])
        ->expectsOutputToContain('organización plataforma')
        ->assertExitCode(1);

    expect(User::query()->where('email', 'admin-sin-plataforma@ejemplo.com')->exists())->toBeFalse();
});

test('user:create-admin genera una password segura cuando --password se omite y la imprime una sola vez', function () {
    $this->artisan('user:create-admin', ['email' => 'admin2@ejemplo.com', '--force' => true])
        ->expectsOutputToContain('Contraseña generada')
        ->assertExitCode(0);

    $user = User::query()->where('email', 'admin2@ejemplo.com')->firstOrFail();
    expect($user->status->code)->toBe('ACTIVE');
});

test('user:create-admin falla con mensaje claro si el email ya existe', function () {
    User::factory()->create(['email' => 'ya-existe@ejemplo.com']);

    $this->artisan('user:create-admin', ['email' => 'ya-existe@ejemplo.com', '--password' => 'Passw0rd123', '--force' => true])
        ->expectsOutputToContain('Ya existe un usuario')
        ->assertExitCode(1);
});

test('user:create-admin pide confirmación y no crea nada si el usuario responde que no', function () {
    $this->artisan('user:create-admin', ['email' => 'admin3@ejemplo.com', '--password' => 'Passw0rd123'])
        ->expectsConfirmation("¿Confirmas crear el administrador 'admin3@ejemplo.com'?", 'no')
        ->assertExitCode(1);

    expect(User::query()->where('email', 'admin3@ejemplo.com')->exists())->toBeFalse();
});

test('user:create-admin falla con mensaje claro si el rol ADMINISTRADOR no existe', function () {
    Role::query()->where('code', 'ADMINISTRADOR')->delete();

    $this->artisan('user:create-admin', ['email' => 'admin4@ejemplo.com', '--password' => 'Passw0rd123', '--force' => true])
        ->expectsOutputToContain("rol 'ADMINISTRADOR'")
        ->assertExitCode(1);
});
