<?php

namespace Database\Seeders;

use App\Models\BranchType;
use Illuminate\Database\Seeder;

/**
 * Catálogo de 8 branch_types (Tipos de Sede). AVISO: la asignación de los 4
 * flags de capacidad (is_logistics/is_storage/is_treatment/is_dispatch) es
 * una interpretación razonable basada en la categoría/nombre de cada tipo
 * -- el diseño de Figma mostraba las 4 columnas de flags pero no fue
 * posible extraer los valores exactos Sí/No por fila en la investigación
 * previa. Sujeta a ajuste si el usuario confirma valores distintos.
 */
class BranchTypeSeeder extends Seeder
{
    public function run(): void
    {
        $branchTypes = [
            ['code' => 'ADM', 'name' => 'Administrativa', 'category' => 'Administrativa', 'is_logistics' => false, 'is_storage' => false, 'is_treatment' => false, 'is_dispatch' => false, 'sort_order' => 1],
            ['code' => 'OPR', 'name' => 'Operativa', 'category' => 'Operativa', 'is_logistics' => false, 'is_storage' => false, 'is_treatment' => false, 'is_dispatch' => false, 'sort_order' => 2],
            ['code' => 'PLT', 'name' => 'Planta', 'category' => 'Productiva', 'is_logistics' => false, 'is_storage' => false, 'is_treatment' => true, 'is_dispatch' => false, 'sort_order' => 3],
            ['code' => 'ACO', 'name' => 'Centro de Acopio', 'category' => 'Logística', 'is_logistics' => true, 'is_storage' => true, 'is_treatment' => false, 'is_dispatch' => false, 'sort_order' => 4],
            ['code' => 'LAB', 'name' => 'Laboratorio', 'category' => 'Técnica', 'is_logistics' => false, 'is_storage' => false, 'is_treatment' => false, 'is_dispatch' => false, 'sort_order' => 5],
            ['code' => 'TRB', 'name' => 'Transbordo', 'category' => 'Logística', 'is_logistics' => true, 'is_storage' => false, 'is_treatment' => false, 'is_dispatch' => true, 'sort_order' => 6],
            ['code' => 'COM', 'name' => 'Comercialización', 'category' => 'Mixta', 'is_logistics' => false, 'is_storage' => true, 'is_treatment' => false, 'is_dispatch' => true, 'sort_order' => 7],
            ['code' => 'TMP', 'name' => 'Temporal', 'category' => 'Mixta', 'is_logistics' => false, 'is_storage' => true, 'is_treatment' => false, 'is_dispatch' => false, 'sort_order' => 8],
        ];

        foreach ($branchTypes as $branchType) {
            BranchType::query()->updateOrCreate(
                ['code' => $branchType['code']],
                [
                    ...$branchType,
                    'is_active' => true,
                ],
            );
        }
    }
}
