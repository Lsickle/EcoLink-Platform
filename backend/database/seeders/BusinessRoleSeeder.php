<?php

namespace Database\Seeders;

use App\Models\BusinessRole;
use Illuminate\Database\Seeder;

/**
 * Eje 2 de autorización: catálogo de 5 business_roles (tipo de
 * organización). No crea ninguna Organization ni le asigna ningún
 * business_role -- no hay organizaciones reales en el sistema todavía.
 *
 * AVISO -- `requires_transport_authorization = true` en GESTOR/SUBGESTOR/
 * TRANSPORTER es un emparejamiento razonable con `can_transport_waste`
 * (si una organización transporta residuos, se asume que requiere
 * autorización de transporte), pero NO fue confirmado explícitamente por el
 * usuario -- es una suposición documentada, no un dato validado por negocio.
 */
class BusinessRoleSeeder extends Seeder
{
    public function run(): void
    {
        BusinessRole::query()->updateOrCreate(
            ['code' => 'GENERATOR'],
            [
                'name' => 'Generador',
                'description' => 'Organización que genera residuos.',
                'can_generate_waste' => true,
                'sort_order' => 1,
                'is_system' => true,
                'is_active' => true,
            ],
        );

        BusinessRole::query()->updateOrCreate(
            ['code' => 'GESTOR'],
            [
                'name' => 'Gestor',
                'description' => 'Organización gestora integral de residuos: transporta, trata, aprueba tratamientos, emite manifiestos y certificados de disposición.',
                'can_transport_waste' => true,
                'can_treat_waste' => true,
                'can_approve_treatments' => true,
                'can_issue_manifests' => true,
                'can_issue_disposal_certificates' => true,
                'requires_environmental_license' => true,
                'requires_transport_authorization' => true,
                'sort_order' => 2,
                'is_system' => true,
                'is_active' => true,
            ],
        );

        BusinessRole::query()->updateOrCreate(
            ['code' => 'SUBGESTOR'],
            [
                'name' => 'Subgestor',
                'description' => 'Organización que transporta residuos en nombre de un Gestor.',
                'can_transport_waste' => true,
                'requires_transport_authorization' => true,
                'sort_order' => 3,
                'is_system' => true,
                'is_active' => true,
            ],
        );

        BusinessRole::query()->updateOrCreate(
            ['code' => 'TRANSPORTER'],
            [
                'name' => 'Transportador',
                'description' => 'Organización dedicada exclusivamente al transporte de residuos.',
                'can_transport_waste' => true,
                'requires_transport_authorization' => true,
                'sort_order' => 4,
                'is_system' => true,
                'is_active' => true,
            ],
        );

        BusinessRole::query()->updateOrCreate(
            ['code' => 'COMERCIALIZADOR'],
            [
                'name' => 'Comercializador',
                'description' => 'Organización que intermedia comercialmente sin capacidades operativas propias.',
                'sort_order' => 5,
                'is_system' => true,
                'is_active' => true,
            ],
        );
    }
}
