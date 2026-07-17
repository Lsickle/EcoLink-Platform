<?php

use App\Models\Organization;
use App\Models\PasswordHistory;
use App\Models\Role;
use App\Models\User;
use App\Models\UserRole;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\PlatformAdminSeeder;
use Database\Seeders\PlatformOrganizationSeeder;
use Database\Seeders\RoleSeeder;
use Database\Seeders\UserStatusSeeder;
use Illuminate\Support\Facades\Hash;

// Incidente 2026-07-16: la cuenta admin real del proyecto
// (luisdelahoz0@gmail.com) solo se creaba a mano vía
// `user:create-admin` (CreateAdminCommand) y nunca quedaba sembrada -- cada
// reset de la BD de desarrollo la borraba. Este seeder la siembra
// reutilizando el propio comando, ver docblock de PlatformAdminSeeder.
//
// La password real ya NO vive hardcodeada en el seeder (ver
// PlatformAdminSeeder::run()) -- viene de config('app.platform_admin_password'),
// que a su vez lee PLATFORM_ADMIN_PASSWORD del .env. Estos tests fijan una
// password de prueba vía config() para no depender del .env real.
const TEST_PLATFORM_ADMIN_PASSWORD = 'ContraseñaDePruebaSegura123!';

beforeEach(function () {
    $this->seed(UserStatusSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->seed(OrganizationStatusSeeder::class);
    $this->seed(PlatformOrganizationSeeder::class);

    config(['app.platform_admin_password' => TEST_PLATFORM_ADMIN_PASSWORD]);
});

test('siembra la cuenta admin de plataforma con rol ADMINISTRADOR activo cuando no existe', function () {
    $this->seed(PlatformAdminSeeder::class);

    $user = User::query()->where('email', PlatformAdminSeeder::ADMIN_EMAIL)->firstOrFail();

    expect($user->status->code)->toBe('ACTIVE')
        ->and(Hash::check(TEST_PLATFORM_ADMIN_PASSWORD, $user->password_hash))->toBeTrue()
        ->and(PasswordHistory::query()->where('user_id', $user->id)->exists())->toBeTrue();

    $role = Role::query()->where('code', 'ADMINISTRADOR')->firstOrFail();
    expect(UserRole::query()->where('user_id', $user->id)->where('role_id', $role->id)->where('is_active', true)->exists())->toBeTrue();

    $platform = Organization::query()->where('tax_id', PlatformOrganizationSeeder::PLATFORM_TAX_ID)->firstOrFail();
    expect($user->tenant_organization_id)->toBe($platform->id);
});

test('el seeder es idempotente (correr dos veces no duplica ni falla)', function () {
    $this->seed(PlatformAdminSeeder::class);
    $this->seed(PlatformAdminSeeder::class);

    expect(User::query()->where('email', PlatformAdminSeeder::ADMIN_EMAIL)->count())->toBe(1);
});

test('el seeder no hace nada si la cuenta ya existe (creada por otro medio, p. ej. el comando de consola)', function () {
    $this->artisan('user:create-admin', [
        'email' => PlatformAdminSeeder::ADMIN_EMAIL,
        '--password' => 'OtraPasswordTemporal123',
        '--force' => true,
    ])->assertExitCode(0);

    $this->seed(PlatformAdminSeeder::class);

    $user = User::query()->where('email', PlatformAdminSeeder::ADMIN_EMAIL)->firstOrFail();

    expect(User::query()->where('email', PlatformAdminSeeder::ADMIN_EMAIL)->count())->toBe(1)
        // No sobrescribe la password ya existente -- el seeder no hizo nada.
        ->and(Hash::check('OtraPasswordTemporal123', $user->password_hash))->toBeTrue();
});

test('el seeder falla explícitamente si falta PLATFORM_ADMIN_PASSWORD en vez de crear una password impredecible', function () {
    config(['app.platform_admin_password' => null]);

    expect(fn () => $this->seed(PlatformAdminSeeder::class))
        ->toThrow(UnexpectedValueException::class, 'PLATFORM_ADMIN_PASSWORD');

    expect(User::query()->where('email', PlatformAdminSeeder::ADMIN_EMAIL)->exists())->toBeFalse();
});

// R1 (revisión de seguridad 2026-07-16): si alguien copia `.env.example` a
// `.env` sin cambiar PLATFORM_ADMIN_PASSWORD, el chequeo `empty()` no lo
// detecta -- 'changeme' no está vacío. El seeder debe rechazar
// explícitamente ese placeholder conocido en vez de sembrar la cuenta admin
// real con una password trivial.
test('el seeder falla explícitamente si PLATFORM_ADMIN_PASSWORD sigue siendo el placeholder de .env.example', function () {
    config(['app.platform_admin_password' => 'changeme']);

    expect(fn () => $this->seed(PlatformAdminSeeder::class))
        ->toThrow(UnexpectedValueException::class, 'PLATFORM_ADMIN_PASSWORD');

    expect(User::query()->where('email', PlatformAdminSeeder::ADMIN_EMAIL)->exists())->toBeFalse();
});

// R2 (revisión de seguridad 2026-07-16): ningún seeder de este proyecto
// verificaba en qué entorno corre. Si `db:seed` corriera en un entorno
// distinto de local/testing (staging futuro, CI futuro) con
// PLATFORM_ADMIN_PASSWORD seteada ahí, crearía la cuenta admin real sin
// confirmación humana -- el seeder siempre pasa `--force`.
test('el seeder falla explícitamente si el entorno actual no es local ni testing', function () {
    // Se usa 'staging' (no 'production') a propósito: `db:seed` trae su
    // propio `ConfirmableTrait` que SOLO interviene cuando el entorno es
    // exactamente 'production', lo que interferiría con esta prueba antes
    // de llegar a la guardia del seeder. La guardia del seeder cubre
    // igual cualquier entorno fuera de local/testing.
    app()->instance('env', 'staging');

    try {
        expect(fn () => $this->seed(PlatformAdminSeeder::class))
            ->toThrow(RuntimeException::class, 'local o testing');

        expect(User::query()->where('email', PlatformAdminSeeder::ADMIN_EMAIL)->exists())->toBeFalse();
    } finally {
        app()->instance('env', 'testing');
    }
});
