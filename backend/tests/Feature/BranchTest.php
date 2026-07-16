<?php

use App\Models\Branch;
use App\Models\BranchType;
use App\Models\Country;
use App\Models\Department;
use App\Models\Locality;
use App\Models\Municipality;
use App\Models\Organization;
use Illuminate\Database\QueryException;

// esquema-bd: branches (Sede) -- FKs geográficas directas en vez de la
// `location_id -> locations` documentada en esquema-bd (D-P01: `locations`
// nunca existió), decisión confirmada en el plan de este lote.

test('sede completa con las 4 FKs geográficas resuelve la cadena municipality->department->country', function () {
    $organization = Organization::factory()->create();
    $branchType = BranchType::factory()->create();
    $country = Country::factory()->create(['name' => 'Colombia']);
    $department = Department::factory()->for($country)->create(['name' => 'Antioquia']);
    $municipality = Municipality::factory()->for($department)->create(['name' => 'Medellín']);
    $locality = Locality::factory()->for($municipality)->create();

    $branch = Branch::factory()->create([
        'organization_id' => $organization->id,
        'branch_type_id' => $branchType->id,
        'country_id' => $country->id,
        'department_id' => $department->id,
        'municipality_id' => $municipality->id,
        'locality_id' => $locality->id,
    ]);

    expect($branch->municipality->department->country->name)->toBe('Colombia')
        ->and($branch->municipality->name)->toBe('Medellín')
        ->and($branch->municipality->department->name)->toBe('Antioquia')
        ->and($branch->locality->id)->toBe($locality->id)
        ->and($branch->branchType->id)->toBe($branchType->id)
        ->and($branch->organization->id)->toBe($organization->id);
});

test('UNIQUE(organization_id, code): mismo code en la misma organización falla', function () {
    $organization = Organization::factory()->create();
    Branch::factory()->for($organization)->create(['code' => 'DUP']);

    expect(fn () => Branch::factory()->for($organization)->create(['code' => 'DUP']))
        ->toThrow(QueryException::class);
});

test('UNIQUE(organization_id, code): mismo code en OTRA organización sí se permite', function () {
    $organizationA = Organization::factory()->create();
    $organizationB = Organization::factory()->create();

    Branch::factory()->for($organizationA)->create(['code' => 'DUP']);
    $branchB = Branch::factory()->for($organizationB)->create(['code' => 'DUP']);

    expect($branchB->code)->toBe('DUP');
});

test('borrar la organización borra en cascada sus sedes', function () {
    // Organization usa SoftDeletes -- ->delete() es un UPDATE (deleted_at),
    // no dispara el ON DELETE CASCADE de Postgres. forceDelete() sí borra
    // la fila de verdad, que es lo que valida esta prueba.
    $organization = Organization::factory()->create();
    $branch = Branch::factory()->for($organization)->create();

    $organization->forceDelete();

    expect(Branch::withoutGlobalScopes()->find($branch->id))->toBeNull();
});

test('no se puede borrar un branch_type que tiene sedes asociadas (restrictOnDelete)', function () {
    // BranchType usa SoftDeletes -- forceDelete() para disparar el ON
    // DELETE RESTRICT real a nivel de Postgres.
    $branchType = BranchType::factory()->create();
    Branch::factory()->create(['branch_type_id' => $branchType->id]);

    expect(fn () => $branchType->forceDelete())->toThrow(QueryException::class);
});

test('las FKs geográficas son opcionales -- una sede puede crearse sin geografía completa', function () {
    $branch = Branch::factory()->create([
        'country_id' => null,
        'department_id' => null,
        'municipality_id' => null,
        'locality_id' => null,
    ]);

    expect($branch->country_id)->toBeNull()
        ->and($branch->department_id)->toBeNull()
        ->and($branch->municipality_id)->toBeNull()
        ->and($branch->locality_id)->toBeNull()
        ->and($branch->exists)->toBeTrue();
});
