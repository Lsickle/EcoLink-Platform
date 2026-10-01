<?php

use App\Models\Organization;
use Illuminate\Support\Facades\DB;

// Migración `2026_09_28_000003_backfill_organization_sidebar_modules_table`
// -- autocontenida (el pipeline de despliegue real solo corre
// `artisan migrate --force`, nunca `db:seed`). RefreshDatabase ya la corre
// como parte de `migrate:fresh` ANTES de que exista ninguna organización de
// prueba, así que para probar el escenario real de despliegue (organización
// YA existente antes de la migración) hay que invocar `up()` de nuevo
// directamente -- mismo patrón que
// `OrganizationPrimaryBusinessRoleTest::backfillPrimaryRoles()`.

test('una organización ya existente antes del backfill queda con exactamente 7 filas is_enabled=true', function () {
    $organization = Organization::factory()->create();

    // Antes de re-correr el backfill, esta organización (creada DESPUÉS del
    // migrate:fresh inicial) no tiene ninguna fila propia todavía -- es
    // exactamente el hueco que la migración de despliegue debe cerrar.
    expect(DB::table('organization_sidebar_modules')->where('organization_id', $organization->id)->count())->toBe(0);

    $migration = require base_path('database/migrations/2026_09_28_000003_backfill_organization_sidebar_modules_table.php');
    $migration->up();

    $rows = DB::table('organization_sidebar_modules')->where('organization_id', $organization->id)->get();

    expect($rows)->toHaveCount(7)
        ->and($rows->pluck('is_enabled')->map(fn ($value) => (bool) $value)->unique()->all())->toBe([true]);
});

test('correr el backfill dos veces no duplica filas (idempotente)', function () {
    $organization = Organization::factory()->create();

    $migration = require base_path('database/migrations/2026_09_28_000003_backfill_organization_sidebar_modules_table.php');
    $migration->up();
    $migration->up();

    expect(DB::table('organization_sidebar_modules')->where('organization_id', $organization->id)->count())->toBe(7)
        ->and(DB::table('sidebar_modules')->count())->toBe(7);
});

test('down() elimina las 7 filas de sidebar_modules y sus filas en organization_sidebar_modules', function () {
    $organization = Organization::factory()->create();

    $migration = require base_path('database/migrations/2026_09_28_000003_backfill_organization_sidebar_modules_table.php');
    $migration->up();

    expect(DB::table('sidebar_modules')->count())->toBe(7);

    $migration->down();

    expect(DB::table('sidebar_modules')->count())->toBe(0)
        ->and(DB::table('organization_sidebar_modules')->where('organization_id', $organization->id)->count())->toBe(0);
});
