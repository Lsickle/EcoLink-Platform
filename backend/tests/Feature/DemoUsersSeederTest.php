<?php

use App\Models\Organization;
use App\Models\Person;
use App\Models\User;
use App\Models\UserRole;
use App\Models\UserStatus;
use Database\Seeders\BranchTypeSeeder;
use Database\Seeders\BusinessRoleSeeder;
use Database\Seeders\CountrySeeder;
use Database\Seeders\DemoOrganizationsSeeder;
use Database\Seeders\DemoUsersSeeder;
use Database\Seeders\DepartmentSeeder;
use Database\Seeders\LocalitySeeder;
use Database\Seeders\MunicipalitySeeder;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\RoleSeeder;
use Database\Seeders\UserStatusSeeder;
use Illuminate\Support\Facades\Hash;

// Reparto por lado (decisión del usuario, 2026-10-12): decidir descargues y
// gestionar el manifiesto de descargue pasó al rol OPERACIONES, y el motor de
// workflow exige el rol de la transición. Los usuarios demo eran solo
// ADMINISTRADOR y LOGÍSTICA, así que en los datos demo nadie podía operar el
// lado planta receptora: cada organización demo con un usuario LOGÍSTICA
// recibe además un usuario OPERACIONES.

beforeEach(function () {
    $this->seed(UserStatusSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->seed(OrganizationStatusSeeder::class);
    $this->seed(BusinessRoleSeeder::class);
    $this->seed(CountrySeeder::class);
    $this->seed(DepartmentSeeder::class);
    $this->seed(MunicipalitySeeder::class);
    $this->seed(LocalitySeeder::class);
    $this->seed(BranchTypeSeeder::class);
    $this->seed(DemoOrganizationsSeeder::class);
});

dataset('usuarios demo OPERACIONES por organización', [
    'Immetal' => ['900123456-1', 'natalia.cardenas', 'natalia.cardenas@immetal.com'],
    'EcoTrata' => ['900234567-2', 'hernan.castillo', 'hernan.castillo@ecotrata.com'],
    'LogVerde' => ['900345678-3', 'carolina.vargas', 'carolina.vargas@logverde.com'],
]);

test('cada organización demo con usuario LOGÍSTICA recibe un usuario con SOLO el rol OPERACIONES, activo y con la misma contraseña de desarrollo', function (string $taxId, string $username, string $email) {
    $this->seed(DemoUsersSeeder::class);

    $organization = Organization::query()->where('tax_id', $taxId)->firstOrFail();

    // Precondición del reparto: la organización ya tiene un usuario LOGÍSTICA demo.
    expect(User::query()->where('tenant_organization_id', $organization->id)->get()->contains(fn (User $user) => $user->hasRole('LOGÍSTICA')))->toBeTrue();

    $user = User::query()->where('username', $username)->firstOrFail();
    $logisticaUser = User::query()->where('tenant_organization_id', $organization->id)->get()->first(fn (User $candidate) => $candidate->hasRole('LOGÍSTICA'));

    expect($user->email)->toBe($email)
        ->and($user->tenant_organization_id)->toBe($organization->id)
        ->and($user->organization_id)->toBe($organization->id)
        ->and($user->user_status_id)->toBe(UserStatus::query()->where('code', 'ACTIVE')->value('id'))
        ->and($user->hasRole('OPERACIONES'))->toBeTrue()
        ->and($user->hasRole('LOGÍSTICA'))->toBeFalse()
        ->and($user->hasRole('ADMINISTRADOR'))->toBeFalse()
        ->and(UserRole::query()->where('user_id', $user->id)->where('is_active', true)->count())->toBe(1)
        ->and($user->person)->not->toBeNull()
        ->and($user->person->is_active)->toBeTrue()
        // Misma forma de fijar la contraseña que el resto de usuarios demo.
        ->and(Hash::check('password', $user->password_hash))->toBeTrue()
        ->and(Hash::check('password', $logisticaUser->password_hash))->toBeTrue();
})->with('usuarios demo OPERACIONES por organización');

test('siembra 15 usuarios demo (5 por organización: 1 ADMINISTRADOR, 3 LOGÍSTICA, 1 OPERACIONES) y es idempotente', function () {
    $this->seed(DemoUsersSeeder::class);
    $this->seed(DemoUsersSeeder::class);

    $organizationIds = Organization::query()->whereIn('tax_id', ['900123456-1', '900234567-2', '900345678-3'])->pluck('id');

    expect($organizationIds)->toHaveCount(3)
        ->and(User::query()->whereIn('tenant_organization_id', $organizationIds)->count())->toBe(15)
        ->and(Person::query()->whereIn('document_number', ['100000013', '100000014', '100000015'])->count())->toBe(3);

    foreach ($organizationIds as $organizationId) {
        $users = User::query()->where('tenant_organization_id', $organizationId)->get();

        expect($users)->toHaveCount(5)
            ->and($users->filter(fn (User $user) => $user->hasRole('ADMINISTRADOR')))->toHaveCount(1)
            ->and($users->filter(fn (User $user) => $user->hasRole('LOGÍSTICA')))->toHaveCount(3)
            ->and($users->filter(fn (User $user) => $user->hasRole('OPERACIONES')))->toHaveCount(1);
    }
});
