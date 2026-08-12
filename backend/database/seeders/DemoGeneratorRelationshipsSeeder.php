<?php

namespace Database\Seeders;

use App\Http\Controllers\Api\Admin\GeneratorGestorRelationshipController;
use App\Http\Controllers\Api\Admin\GeneratorSubgestorRelationshipController;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Datos de demostración: vincula a Immetal (Generador, ya sembrado por
 * `DemoOrganizationsSeeder`) con LogVerde (Subgestor) y EcoTrata (Gestor) --
 * mismas 3 organizaciones demo, ahora también con la relación comercial que
 * habilita la visibilidad cross-tenant (`User::
 * hasActiveGeneratorRelationshipWith()`, pedido explícito del usuario,
 * 2026-08-11) para poder probarla en staging sin tener que crearla a mano
 * desde la UI en cada entorno.
 *
 * Reutiliza `createOrReactivate()` de ambos controllers -- mismo camino
 * idempotente que ya usa `GeneratorBulkImportService`, evita duplicar aquí
 * la lógica de "crear o reactivar". Debe correr DESPUÉS de
 * `DemoOrganizationsSeeder` (necesita las 3 organizaciones) y de
 * `DemoUsersSeeder` (usa a Ricardo Peña/Diana López, los ADMINISTRADOR de
 * LogVerde/EcoTrata, como actor que autoriza -- consistente con quién
 * realmente haría esto en producción, no un actor sintético).
 */
class DemoGeneratorRelationshipsSeeder extends Seeder
{
    public function run(): void
    {
        $immetal = Organization::query()->where('tax_id', '900123456-1')->first();
        $ecotrata = Organization::query()->where('tax_id', '900234567-2')->first();
        $logverde = Organization::query()->where('tax_id', '900345678-3')->first();

        if (! $immetal || ! $ecotrata || ! $logverde) {
            return;
        }

        $ricardo = User::query()->where('username', 'ricardo.pena')->first();
        $diana = User::query()->where('username', 'diana.lopez')->first();

        if ($ricardo) {
            GeneratorSubgestorRelationshipController::createOrReactivate($immetal->id, $logverde->id, $ricardo);
        }

        if ($diana) {
            GeneratorGestorRelationshipController::createOrReactivate($immetal->id, $ecotrata->id, $diana);
        }
    }
}
