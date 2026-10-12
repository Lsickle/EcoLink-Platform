<?php

use App\Models\Role;
use App\Models\User;
use App\Models\UserRole;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/*
|--------------------------------------------------------------------------
| Test Case
|--------------------------------------------------------------------------
|
| The closure you provide to your test functions is always bound to a specific PHPUnit test
| case class. By default, that class is "PHPUnit\Framework\TestCase". Of course, you may
| need to change it using the "pest()" function to bind different classes or traits.
|
*/

pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->in('Feature', 'Unit');

/*
|--------------------------------------------------------------------------
| Expectations
|--------------------------------------------------------------------------
|
| When you're writing tests, you often need to check that values meet certain conditions. The
| "expect()" function gives you access to a set of "expectations" methods that you can use
| to assert different things. Of course, you may extend the Expectation API at any time.
|
*/

expect()->extend('toBeOne', function () {
    return $this->toBe(1);
});

/*
|--------------------------------------------------------------------------
| Functions
|--------------------------------------------------------------------------
|
| While Pest is very powerful out-of-the-box, you may have some testing code specific to your
| project that you don't want to repeat in every file. Here you can also expose helpers as
| global functions to help you to reduce the number of lines of code in your test files.
|
*/

function something()
{
    // ..
}

/**
 * Reparto por lado (decisión del usuario, 2026-10-12): LOGÍSTICA = lado
 * transportador, OPERACIONES = lado planta receptora. Devuelve el rol de
 * sistema REAL (tal como lo deja `RolePermissionSeeder`) que cubre todos los
 * `$codes` pedidos, o ambos si ninguno los cubre por sí solo (actor de una
 * organización que es transportadora y receptora a la vez).
 *
 * Lo usan los fixtures de descargue (`urActor()`/`muActor()`): antes
 * asignaban LOGÍSTICA a ciegas e ignoraban `$codes`, lo que dejó de ser
 * válido cuando el lado receptor pasó a OPERACIONES.
 *
 * @param  list<string>  $codes
 * @return list<string>
 */
function seededTransportSideRoleCodesFor(array $codes): array
{
    $sideRoleCodes = ['LOGÍSTICA', 'OPERACIONES'];

    foreach ($sideRoleCodes as $roleCode) {
        $granted = Role::query()->where('code', $roleCode)->firstOrFail()
            ->permissions()->wherePivot('is_active', true)->pluck('code')->all();

        if (array_diff($codes, $granted) === []) {
            return [$roleCode];
        }
    }

    return $sideRoleCodes;
}

/**
 * Usuario con EXACTAMENTE los roles de sistema indicados (ya sembrados), sin
 * permisos ad-hoc -- para probar el RBAC real de producción.
 *
 * @param  list<string>  $roleCodes
 */
function actorWithSeededRoles(array $roleCodes, ?int $tenantOrganizationId = null): User
{
    $actor = User::factory()->create(['tenant_organization_id' => $tenantOrganizationId]);

    foreach ($roleCodes as $roleCode) {
        UserRole::query()->create([
            'user_id' => $actor->id,
            'role_id' => Role::query()->where('code', $roleCode)->firstOrFail()->id,
            'is_active' => true,
        ]);
    }

    return $actor;
}
