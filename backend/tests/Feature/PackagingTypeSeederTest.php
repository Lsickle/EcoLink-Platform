<?php

use App\Models\PackagingType;
use Database\Seeders\PackagingTypeSeeder;

// Catálogo de 29 Tipos de Embalaje (Batch 3/3, último de Catálogos
// Maestros) -- datos REALES confirmados. Ver criterio de `code` en el
// docblock de PackagingTypeSeeder.

beforeEach(function () {
    $this->seed(PackagingTypeSeeder::class);
});

test('siembra exactamente 29 packaging_types', function () {
    expect(PackagingType::query()->count())->toBe(29);
});

dataset('packaging_types esperados', [
    'BOLSA' => ['BOLSA', 'Bolsa'],
    'BOLSA_SEG' => ['BOLSA_SEG', 'Bolsa de seguridad'],
    'SACO' => ['SACO', 'Saco'],
    'BIGBAG' => ['BIGBAG', 'Big Bag'],
    'CAJA_CARTON' => ['CAJA_CARTON', 'Caja de cartón'],
    'CAJA_PLAST' => ['CAJA_PLAST', 'Caja plástica'],
    'CANECA_PLAST' => ['CANECA_PLAST', 'Caneca plástica'],
    'CANECA_METAL' => ['CANECA_METAL', 'Caneca metálica'],
    'TAMBOR_PLAST' => ['TAMBOR_PLAST', 'Tambor plástico'],
    'TAMBOR_METAL' => ['TAMBOR_METAL', 'Tambor metálico'],
    'BIDON_PLAST' => ['BIDON_PLAST', 'Bidón plástico'],
    'BIDON_METAL' => ['BIDON_METAL', 'Bidón metálico'],
    'GARRAFA' => ['GARRAFA', 'Garrafa'],
    'CONT_PLAST' => ['CONT_PLAST', 'Contenedor plástico'],
    'CONT_METAL' => ['CONT_METAL', 'Contenedor metálico'],
    'CONT_IBC' => ['CONT_IBC', 'Contenedor IBC'],
    'ESTIBA_EMB' => ['ESTIBA_EMB', 'Estiba con embalaje'],
    'RECIP_HERM' => ['RECIP_HERM', 'Recipiente hermético'],
    'FRASCO' => ['FRASCO', 'Frasco'],
    'BOTELLA' => ['BOTELLA', 'Botella'],
    'AMPOLLA' => ['AMPOLLA', 'Ampolla'],
    'CILINDRO' => ['CILINDRO', 'Cilindro'],
    'TANQUE_PORT' => ['TANQUE_PORT', 'Tanque portátil'],
    'CAJA_CORTOP' => ['CAJA_CORTOP', 'Caja para cortopunzantes'],
    'CONT_BIOSAN' => ['CONT_BIOSAN', 'Contenedor para residuos biosanitarios'],
    'CONT_REFRIG' => ['CONT_REFRIG', 'Contenedor refrigerado'],
    'GRANEL' => ['GRANEL', 'A granel'],
    'OTRO' => ['OTRO', 'Otro'],
    'NO_APLICA' => ['NO_APLICA', 'No aplica'],
]);

test('cada packaging_type tiene el code/name exactos', function (string $code, string $name) {
    $packagingType = PackagingType::query()->where('code', $code)->firstOrFail();

    expect($packagingType->name)->toBe($name)
        ->and($packagingType->is_system)->toBeTrue()
        ->and($packagingType->is_active)->toBeTrue();
})->with('packaging_types esperados');

test('el seeder es idempotente (correr dos veces no duplica filas)', function () {
    $this->seed(PackagingTypeSeeder::class);

    expect(PackagingType::query()->count())->toBe(29);
});
