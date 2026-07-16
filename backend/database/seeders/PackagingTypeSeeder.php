<?php

namespace Database\Seeders;

use App\Models\PackagingType;
use Illuminate\Database\Seeder;

/**
 * Catálogo de 29 Tipos de Embalaje -- datos REALES confirmados, ver
 * `database/seeders/data_packaging_types.json` (id/name ya limpios, sin
 * `code`). `code` = esquema propio de este lote (Batch 3/3, último de
 * Catálogos Maestros), mapeado por `id` porque el JSON no trae `code`.
 *
 * Criterio de `code` (declarado explícitamente al hilo principal, sin
 * fuente confirmada de códigos cortos):
 *   1. Mayúscula, sin tildes/diacríticos.
 *   2. Nombres de una sola palabra -> la palabra completa (BOLSA, SACO,
 *      GARRAFA, FRASCO, BOTELLA, AMPOLLA, CILINDRO, OTRO).
 *   3. Nombres compuestos -> se descartan preposiciones/artículos
 *      (de/para/con/a) y se unen las palabras significativas con `_`.
 *   4. Adjetivos calificadores largos y recurrentes se abrevian a un radical
 *      corto y consistente para mantener los códigos legibles:
 *      PLASTICO->PLAST, METALICO->METAL, HERMETICO->HERM, PORTATIL->PORT,
 *      REFRIGERADO->REFRIG, CORTOPUNZANTES->CORTOP, BIOSANITARIOS->BIOSAN,
 *      SEGURIDAD->SEG, EMBALAJE->EMB. El sustantivo "Contenedor" se abrevia
 *      a CONT solo cuando aparece calificado por uno de esos adjetivos (ya
 *      es lo bastante largo para justificarlo, igual que el resto).
 *   5. "Big Bag" es un término técnico/anglicismo ya establecido en el
 *      sector -- se mantiene como token único sin guión bajo ni
 *      abreviatura (BIGBAG), no como BIG_BAG.
 *   6. "A granel" descarta la preposición "A" -> GRANEL.
 *   7. "No aplica" mantiene ambas palabras (ninguna es preposición/artículo
 *      vacío de sentido en este contexto) -> NO_APLICA.
 */
class PackagingTypeSeeder extends Seeder
{
    private const CODES = [
        1 => 'BOLSA',
        2 => 'BOLSA_SEG',
        3 => 'SACO',
        4 => 'BIGBAG',
        5 => 'CAJA_CARTON',
        6 => 'CAJA_PLAST',
        7 => 'CANECA_PLAST',
        8 => 'CANECA_METAL',
        9 => 'TAMBOR_PLAST',
        10 => 'TAMBOR_METAL',
        11 => 'BIDON_PLAST',
        12 => 'BIDON_METAL',
        13 => 'GARRAFA',
        14 => 'CONT_PLAST',
        15 => 'CONT_METAL',
        16 => 'CONT_IBC',
        17 => 'ESTIBA_EMB',
        18 => 'RECIP_HERM',
        19 => 'FRASCO',
        20 => 'BOTELLA',
        21 => 'AMPOLLA',
        22 => 'CILINDRO',
        23 => 'TANQUE_PORT',
        24 => 'CAJA_CORTOP',
        25 => 'CONT_BIOSAN',
        26 => 'CONT_REFRIG',
        27 => 'GRANEL',
        28 => 'OTRO',
        29 => 'NO_APLICA',
    ];

    public function run(): void
    {
        $rows = json_decode(file_get_contents(database_path('seeders/data_packaging_types.json')), true);

        foreach ($rows as $row) {
            $id = $row['id'];

            if (! isset(self::CODES[$id])) {
                throw new \LogicException("Tipo de embalaje id={$id} sin code mapeado en PackagingTypeSeeder.");
            }

            PackagingType::query()->updateOrCreate(
                ['code' => self::CODES[$id]],
                [
                    'name' => $row['name'],
                    'is_system' => true,
                    'is_active' => true,
                ],
            );
        }
    }
}
