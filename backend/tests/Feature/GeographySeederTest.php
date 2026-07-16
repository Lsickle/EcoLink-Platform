<?php

use App\Models\Country;
use App\Models\Department;
use App\Models\Locality;
use App\Models\Municipality;
use Database\Seeders\CountrySeeder;
use Database\Seeders\DepartmentSeeder;
use Database\Seeders\LocalitySeeder;
use Database\Seeders\MunicipalitySeeder;
use Illuminate\Database\QueryException;

// esquema-bd (D-P01, geografía en cascada) -- Batch 1/3 de Catálogos
// Maestros (2026-07-15): dataset REAL y completo (246 países / 33
// departamentos / 1.119 municipios / 20 localidades de Bogotá), reemplaza
// el subconjunto de prueba del extinto `GeographySeeder` (1 país, 4
// "departamentos", 4 municipios, 2 localidades).

function seedGeography(): void
{
    (new CountrySeeder)->run();
    (new DepartmentSeeder)->run();
    (new MunicipalitySeeder)->run();
    (new LocalitySeeder)->run();
}

beforeEach(function () {
    seedGeography();
});

test('siembra 246 países, con Colombia activa entre ellos', function () {
    expect(Country::query()->count())->toBe(246);

    $colombia = Country::query()->where('iso_code', 'CO')->firstOrFail();
    expect($colombia->name)->toBe('Colombia')
        ->and($colombia->is_active)->toBeTrue();
});

test('siembra 33 departamentos reales bajo Colombia, con dane_code NULL', function () {
    $colombia = Country::query()->where('iso_code', 'CO')->firstOrFail();

    $departments = Department::query()->where('country_id', $colombia->id)->get();

    expect($departments)->toHaveCount(33)
        ->and($departments->pluck('dane_code')->unique()->all())->toBe([null])
        ->and($departments->pluck('name'))->toContain('ANTIOQUIA', 'BOGOTÁ D.C.', 'CUNDINAMARCA');
});

test('siembra 1.119 municipios reales, con codigo_dane real y department_id resuelto', function () {
    expect(Municipality::query()->count())->toBe(1119);

    $bogotaDepartment = Department::query()->where('name', 'BOGOTÁ D.C.')->firstOrFail();
    $bogota = Municipality::query()->where('codigo_dane', '11001')->firstOrFail();

    expect($bogota->name)->toBe('BOGOTA D.C.')
        ->and($bogota->department_id)->toBe($bogotaDepartment->id);
});

test('siembra las 20 localidades reales bajo el municipio Bogotá D.C.', function () {
    $bogota = Municipality::query()->where('codigo_dane', '11001')->firstOrFail();

    $localities = Locality::query()->where('municipality_id', $bogota->id)->get();

    expect($localities)->toHaveCount(20)
        ->and($localities->pluck('name'))->toContain('USAQUÉN', 'CHAPINERO', 'SUMAPAZ')
        ->and($localities->first()->municipality->id)->toBe($bogota->id);
});

test('no permite borrar un country que tiene departments hijos (restrictOnDelete)', function () {
    $colombia = Country::query()->where('iso_code', 'CO')->firstOrFail();

    expect(fn () => $colombia->delete())->toThrow(QueryException::class);
});

test('no permite borrar un municipality que tiene localities hijos (restrictOnDelete)', function () {
    $bogota = Municipality::query()->where('codigo_dane', '11001')->firstOrFail();

    expect(fn () => $bogota->delete())->toThrow(QueryException::class);
});

test('los 4 seeders son idempotentes (correr dos veces no duplica filas)', function () {
    seedGeography();

    expect(Country::query()->count())->toBe(246)
        ->and(Department::query()->count())->toBe(33)
        ->and(Municipality::query()->count())->toBe(1119)
        ->and(Locality::query()->count())->toBe(20);
});
