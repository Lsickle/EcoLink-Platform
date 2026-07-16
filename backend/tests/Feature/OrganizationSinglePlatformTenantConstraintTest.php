<?php

use App\Models\Organization;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\PlatformOrganizationSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

// Hallazgo Bajo (especialista-seguridad, revisión del mecanismo de
// invitación, 2026-07-14): D-CER-04 ("exactamente una fila
// is_platform_tenant=true en todo el sistema") solo se sostenía por
// disciplina de PlatformOrganizationSeeder, sin constraint de base de datos.
// Este test confirma el índice único parcial
// `organizations_single_platform_tenant` (migración
// add_unique_single_platform_tenant_index_to_organizations_table),
// insertando directamente vía DB::table() para bypassear Eloquent (y su ya
// removido `is_platform_tenant` de $fillable) y probar el constraint real de
// la base de datos, no la disciplina de la capa de aplicación.

beforeEach(function () {
    $this->seed(OrganizationStatusSeeder::class);
    $this->seed(PlatformOrganizationSeeder::class);
});

test('insertar una segunda organización con is_platform_tenant=true viola el índice único parcial', function () {
    expect(Organization::query()->where('is_platform_tenant', true)->count())->toBe(1);

    $activeStatusId = DB::table('organization_statuses')->where('code', 'ACT')->value('id');

    DB::table('organizations')->insert([
        'uuid' => (string) Str::uuid(),
        'legal_name' => 'Otra Organización Plataforma',
        'tax_id' => 'OTRA-PLATAFORMA',
        'tax_id_type' => 'NIT',
        'organization_status_id' => $activeStatusId,
        'is_platform_tenant' => true,
        'traceability_uuid' => (string) Str::uuid(),
        'created_at' => now(),
    ]);
})->throws(QueryException::class);

test('el índice único parcial no bloquea múltiples organizaciones con is_platform_tenant=false', function () {
    $activeStatusId = DB::table('organization_statuses')->where('code', 'ACT')->value('id');

    DB::table('organizations')->insert([
        'uuid' => (string) Str::uuid(),
        'legal_name' => 'Organización Tenant Regular 1',
        'tax_id' => 'TENANT-001',
        'tax_id_type' => 'NIT',
        'organization_status_id' => $activeStatusId,
        'is_platform_tenant' => false,
        'traceability_uuid' => (string) Str::uuid(),
        'created_at' => now(),
    ]);

    DB::table('organizations')->insert([
        'uuid' => (string) Str::uuid(),
        'legal_name' => 'Organización Tenant Regular 2',
        'tax_id' => 'TENANT-002',
        'tax_id_type' => 'NIT',
        'organization_status_id' => $activeStatusId,
        'is_platform_tenant' => false,
        'traceability_uuid' => (string) Str::uuid(),
        'created_at' => now(),
    ]);

    expect(Organization::query()->where('is_platform_tenant', false)->count())->toBe(2);
});

test('is_platform_tenant no es mass-assignable vía Organization::create()', function () {
    $activeStatusId = DB::table('organization_statuses')->where('code', 'ACT')->value('id');

    $organization = Organization::query()->create([
        'legal_name' => 'Intento de Mass-Assignment',
        'tax_id' => 'MASS-ASSIGN-001',
        'tax_id_type' => 'NIT',
        'organization_status_id' => $activeStatusId,
        'is_platform_tenant' => true,
    ]);

    expect($organization->fresh()->is_platform_tenant)->toBeFalse();
});
