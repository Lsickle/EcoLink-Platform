<?php

use App\Models\BusinessRole;
use App\Models\Organization;
use App\Models\OrganizationBusinessRole;

// Organization::primaryBusinessRole() -- tipo de negocio "primario" de la
// organización, expuesto en la API para que el frontend lo combine con el
// rol de sistema del usuario (ej. "Administrador - Generador"). Entre los
// business_roles ACTIVOS (pivote y catálogo), gana el marcado
// `is_primary_role=true`; si ninguno está marcado, cae al de menor
// `business_roles.sort_order` -- mismo criterio de desempate que el backfill
// de la migración `add_is_primary_role_to_organization_business_roles_table`.

test('un solo business_role activo -> ese es el primario', function () {
    $organization = Organization::factory()->create();
    $businessRole = BusinessRole::factory()->create(['name' => 'Generador', 'sort_order' => 3]);

    OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id,
        'business_role_id' => $businessRole->id,
        'assigned_at' => now(),
        'is_active' => true,
    ]);

    expect($organization->primaryBusinessRole()?->id)->toBe($businessRole->id);
});

test('dos activos, el marcado is_primary_role=true gana aunque NO sea el de menor sort_order', function () {
    $organization = Organization::factory()->create();
    $lowestSortOrder = BusinessRole::factory()->create(['name' => 'Generador', 'sort_order' => 1]);
    $markedPrimary = BusinessRole::factory()->create(['name' => 'Gestor', 'sort_order' => 5]);

    OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id,
        'business_role_id' => $lowestSortOrder->id,
        'assigned_at' => now(),
        'is_active' => true,
        'is_primary_role' => false,
    ]);
    OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id,
        'business_role_id' => $markedPrimary->id,
        'assigned_at' => now(),
        'is_active' => true,
        'is_primary_role' => true,
    ]);

    expect($organization->primaryBusinessRole()?->id)->toBe($markedPrimary->id);
});

test('dos activos, ninguno marcado -> gana el de menor sort_order (estado previo al backfill)', function () {
    $organization = Organization::factory()->create();
    $lowestSortOrder = BusinessRole::factory()->create(['name' => 'Gestor', 'sort_order' => 2]);
    $higherSortOrder = BusinessRole::factory()->create(['name' => 'Transportador', 'sort_order' => 8]);

    OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id,
        'business_role_id' => $higherSortOrder->id,
        'assigned_at' => now(),
        'is_active' => true,
    ]);
    OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id,
        'business_role_id' => $lowestSortOrder->id,
        'assigned_at' => now(),
        'is_active' => true,
    ]);

    expect($organization->primaryBusinessRole()?->id)->toBe($lowestSortOrder->id);
});

test('sin ningún business_role activo -> null', function () {
    $organization = Organization::factory()->create();

    expect($organization->primaryBusinessRole())->toBeNull();
});

test('business_role marcado primario pero con pivot is_active=false se ignora -> cae al de menor sort_order entre los activos', function () {
    $organization = Organization::factory()->create();
    $inactiveButMarkedPrimary = BusinessRole::factory()->create(['name' => 'Subgestor', 'sort_order' => 1]);
    $activeLowestSortOrder = BusinessRole::factory()->create(['name' => 'Gestor', 'sort_order' => 4]);

    OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id,
        'business_role_id' => $inactiveButMarkedPrimary->id,
        'assigned_at' => now(),
        'is_active' => false,
        'is_primary_role' => true,
    ]);
    OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id,
        'business_role_id' => $activeLowestSortOrder->id,
        'assigned_at' => now(),
        'is_active' => true,
        'is_primary_role' => false,
    ]);

    expect($organization->primaryBusinessRole()?->id)->toBe($activeLowestSortOrder->id);
});

// ---- Backfill de la migración add_is_primary_role_to_organization_business_roles_table ----

test('el backfill de la migración marca is_primary_role=true en el activo de menor sort_order, exactamente uno por organización', function () {
    $organization = Organization::factory()->create();
    $lowestSortOrder = BusinessRole::factory()->create(['name' => 'Generador', 'sort_order' => 1]);
    $higherSortOrder = BusinessRole::factory()->create(['name' => 'Gestor', 'sort_order' => 9]);

    $winnerPivot = OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id,
        'business_role_id' => $lowestSortOrder->id,
        'assigned_at' => now(),
        'is_active' => true,
    ]);
    $loserPivot = OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id,
        'business_role_id' => $higherSortOrder->id,
        'assigned_at' => now(),
        'is_active' => true,
    ]);

    // Ambos nacen is_primary_role=false (default de la columna, ya aplicada
    // por RefreshDatabase) -- simula el estado real pre-backfill de datos ya
    // existentes en la tabla antes de correr esta migración. `refresh()`
    // porque `create()` no repuebla el modelo en memoria con el DEFAULT
    // resuelto por Postgres -- el atributo simplemente no está presente hasta
    // releerlo de la BD.
    expect($winnerPivot->refresh()->is_primary_role)->toBeFalse()
        ->and($loserPivot->refresh()->is_primary_role)->toBeFalse();

    $migration = require base_path('database/migrations/2026_08_19_000001_add_is_primary_role_to_organization_business_roles_table.php');

    $backfill = new ReflectionMethod($migration, 'backfillPrimaryRoles');
    $backfill->setAccessible(true);
    $backfill->invoke($migration);

    expect(OrganizationBusinessRole::query()->where('is_primary_role', true)->count())->toBe(1)
        ->and($winnerPivot->refresh()->is_primary_role)->toBeTrue()
        ->and($loserPivot->refresh()->is_primary_role)->toBeFalse();
});

test('el backfill de la migración también marca is_primary_role=true cuando la organización tiene un único business_role activo', function () {
    $organization = Organization::factory()->create();
    $businessRole = BusinessRole::factory()->create(['name' => 'Generador', 'sort_order' => 1]);

    $pivot = OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id,
        'business_role_id' => $businessRole->id,
        'assigned_at' => now(),
        'is_active' => true,
    ]);

    expect($pivot->refresh()->is_primary_role)->toBeFalse();

    $migration = require base_path('database/migrations/2026_08_19_000001_add_is_primary_role_to_organization_business_roles_table.php');

    $backfill = new ReflectionMethod($migration, 'backfillPrimaryRoles');
    $backfill->setAccessible(true);
    $backfill->invoke($migration);

    expect($pivot->refresh()->is_primary_role)->toBeTrue();
});

// ---- Organization::ensurePrimaryBusinessRole() (2026-09-28) ----
//
// Garantiza la invariante "si una organización tiene ≥1 business_role ACTIVO,
// exactamente uno tiene is_primary_role=true" después de cualquier mutación
// -- ver AssignBusinessRoleCommand y
// OrganizationController::assignBusinessRole()/revokeBusinessRole()/
// syncBusinessRoles(), que la invocan.

test('ensurePrimaryBusinessRole promueve al único activo cuando ninguno está marcado', function () {
    $organization = Organization::factory()->create();
    $businessRole = BusinessRole::factory()->create(['sort_order' => 1]);

    OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id,
        'business_role_id' => $businessRole->id,
        'assigned_at' => now(),
        'is_active' => true,
    ]);

    $organization->ensurePrimaryBusinessRole();

    expect(OrganizationBusinessRole::query()
        ->where('organization_id', $organization->id)
        ->where('business_role_id', $businessRole->id)
        ->value('is_primary_role'))->toBeTrue();
});

test('ensurePrimaryBusinessRole es un NO-OP si ya hay uno marcado primario', function () {
    $organization = Organization::factory()->create();
    $alreadyPrimary = BusinessRole::factory()->create(['sort_order' => 5]);
    $other = BusinessRole::factory()->create(['sort_order' => 1]);

    OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id, 'business_role_id' => $alreadyPrimary->id,
        'assigned_at' => now(), 'is_active' => true, 'is_primary_role' => true,
    ]);
    OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id, 'business_role_id' => $other->id,
        'assigned_at' => now(), 'is_active' => true, 'is_primary_role' => false,
    ]);

    $organization->ensurePrimaryBusinessRole();

    expect(OrganizationBusinessRole::query()->where('organization_id', $organization->id)->where('business_role_id', $alreadyPrimary->id)->value('is_primary_role'))->toBeTrue()
        ->and(OrganizationBusinessRole::query()->where('organization_id', $organization->id)->where('business_role_id', $other->id)->value('is_primary_role'))->toBeFalse();
});

test('ensurePrimaryBusinessRole no falla y no marca nada cuando no hay ningún business_role activo', function () {
    $organization = Organization::factory()->create();

    $organization->ensurePrimaryBusinessRole();

    expect(OrganizationBusinessRole::query()->where('organization_id', $organization->id)->exists())->toBeFalse();
});

// ---- Organization::setPrimaryBusinessRole() (2026-09-28) ----

test('setPrimaryBusinessRole reemplaza al primario vigente por el indicado', function () {
    $organization = Organization::factory()->create();
    $current = BusinessRole::factory()->create();
    $target = BusinessRole::factory()->create();

    OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id, 'business_role_id' => $current->id,
        'assigned_at' => now(), 'is_active' => true, 'is_primary_role' => true,
    ]);
    OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id, 'business_role_id' => $target->id,
        'assigned_at' => now(), 'is_active' => true, 'is_primary_role' => false,
    ]);

    $organization->setPrimaryBusinessRole($target);

    expect(OrganizationBusinessRole::query()->where('organization_id', $organization->id)->where('business_role_id', $current->id)->value('is_primary_role'))->toBeFalse()
        ->and(OrganizationBusinessRole::query()->where('organization_id', $organization->id)->where('business_role_id', $target->id)->value('is_primary_role'))->toBeTrue();
});

test('setPrimaryBusinessRole lanza ValidationException si el business_role no está activo para la organización', function () {
    $organization = Organization::factory()->create();
    $businessRole = BusinessRole::factory()->create();

    $organization->setPrimaryBusinessRole($businessRole);
})->throws(Illuminate\Validation\ValidationException::class);
