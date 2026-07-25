<?php

namespace Database\Seeders;

use App\Models\Organization;
use App\Models\Person;
use App\Models\Role;
use App\Models\User;
use App\Models\UserRole;
use App\Models\UserStatus;
use Illuminate\Database\Seeder;

/**
 * Datos de demostración (no de catálogo crítico): 4 usuarios reales por
 * cada una de las 3 organizaciones demo ya sembradas por
 * `DemoOrganizationsSeeder` (12 en total), con mezcla de roles vía
 * `UserRole` -- al menos 1 `ADMINISTRADOR` y al menos 1 `LOGÍSTICA` por
 * organización (necesario para verificar el acceso dual del módulo
 * Vehículos -- y de Sedes/Contactos, que usa el mismo mecanismo -- con una
 * cuenta real de cada tipo). Debe correr DESPUÉS de `DemoOrganizationsSeeder`
 * (necesita las organizaciones) y de `RoleSeeder` (necesita el rol
 * `LOGÍSTICA`).
 *
 * Contraseña de desarrollo predecible: `password` (default de
 * `UserFactory`), documentada en el resumen entregado al hilo principal
 * para verificación en navegador.
 *
 * Emails con el dominio de la empresa (`@immetal.com`/`@ecotrata.com`/
 * `@logverde.com`), coherente con el criterio ya usado por los contactos de
 * `DemoOrganizationsSeeder` -- son entidades separadas (`Person` de
 * contacto vs. `Person` de usuario), no hace falta que coincidan ni en
 * nombre ni en correo.
 *
 * Idempotente por `username`: si el usuario ya existe se omite su creación
 * (y la de su `Person`) y solo se asegura la asignación de rol vía
 * `UserRole::updateOrCreate()` -- reejecutar el seeder no duplica usuarios
 * ni personas.
 */
class DemoUsersSeeder extends Seeder
{
    public function run(): void
    {
        $activeStatusId = UserStatus::query()->where('code', 'ACTIVE')->value('id');
        $administrador = Role::query()->where('code', 'ADMINISTRADOR')->firstOrFail();
        $logistica = Role::query()->where('code', 'LOGÍSTICA')->firstOrFail();

        $organizationsUsers = [
            // Industrias Metálicas del Norte S.A.S. (Immetal) -- Generador.
            '900123456-1' => [
                'domain' => 'immetal.com',
                'users' => [
                    ['first' => 'Camilo', 'last' => 'Mendoza', 'username' => 'camilo.mendoza', 'doc' => '100000001', 'role' => 'ADMINISTRADOR'],
                    ['first' => 'Andrea', 'last' => 'Rojas', 'username' => 'andrea.rojas', 'doc' => '100000002', 'role' => 'LOGÍSTICA'],
                    ['first' => 'Jorge', 'last' => 'Salazar', 'username' => 'jorge.salazar', 'doc' => '100000003', 'role' => 'LOGÍSTICA'],
                    ['first' => 'Paula', 'last' => 'Díaz', 'username' => 'paula.diaz.immetal', 'doc' => '100000004', 'role' => 'LOGÍSTICA'],
                ],
            ],
            // Gestión Ambiental Integral EcoTrata S.A.S. (EcoTrata) -- Gestor.
            '900234567-2' => [
                'domain' => 'ecotrata.com',
                'users' => [
                    ['first' => 'Diana', 'last' => 'López', 'username' => 'diana.lopez', 'doc' => '100000005', 'role' => 'ADMINISTRADOR'],
                    ['first' => 'Fernando', 'last' => 'Díaz', 'username' => 'fernando.diaz', 'doc' => '100000006', 'role' => 'LOGÍSTICA'],
                    ['first' => 'Sandra', 'last' => 'Pérez', 'username' => 'sandra.perez', 'doc' => '100000007', 'role' => 'LOGÍSTICA'],
                    ['first' => 'Julián', 'last' => 'Gómez', 'username' => 'julian.gomez', 'doc' => '100000008', 'role' => 'LOGÍSTICA'],
                ],
            ],
            // Transportes y Logística Verde S.A.S. (LogVerde) -- Subgestor.
            '900345678-3' => [
                'domain' => 'logverde.com',
                'users' => [
                    ['first' => 'Ricardo', 'last' => 'Peña', 'username' => 'ricardo.pena', 'doc' => '100000009', 'role' => 'ADMINISTRADOR'],
                    ['first' => 'Mónica', 'last' => 'Salazar', 'username' => 'monica.salazar', 'doc' => '100000010', 'role' => 'LOGÍSTICA'],
                    ['first' => 'Edwin', 'last' => 'Torres', 'username' => 'edwin.torres', 'doc' => '100000011', 'role' => 'LOGÍSTICA'],
                    ['first' => 'Wilson', 'last' => 'Muñoz', 'username' => 'wilson.munoz', 'doc' => '100000012', 'role' => 'LOGÍSTICA'],
                ],
            ],
        ];

        $roleByCode = ['ADMINISTRADOR' => $administrador, 'LOGÍSTICA' => $logistica];

        foreach ($organizationsUsers as $taxId => $config) {
            $organization = Organization::query()->where('tax_id', $taxId)->first();

            if (! $organization) {
                continue;
            }

            foreach ($config['users'] as $userData) {
                $role = $roleByCode[$userData['role']];

                $user = User::query()->where('username', $userData['username'])->first();

                if (! $user) {
                    $person = Person::factory()->create([
                        'document_type' => 'CC',
                        'document_number' => $userData['doc'],
                        'first_name' => $userData['first'],
                        'last_name' => $userData['last'],
                        'email' => strtolower($userData['username']).'.person@'.$config['domain'],
                        'phone' => '300'.fake()->numerify('#######'),
                        'is_active' => true,
                    ]);

                    // User::factory() fija password_hash='password' (default
                    // de UserFactory, ver docblock) y respeta el default de
                    // BD `is_active=true` -- no pasa por el flujo de
                    // invitación (PENDING_ACTIVATION) que sí usa
                    // UserManagementController::store(), a propósito: es
                    // data de demo lista para iniciar sesión de inmediato.
                    $user = User::factory()->create([
                        'tenant_organization_id' => $organization->id,
                        'organization_id' => $organization->id,
                        'person_id' => $person->id,
                        'username' => $userData['username'],
                        'email' => strtolower($userData['username']).'@'.$config['domain'],
                        'user_status_id' => $activeStatusId,
                    ]);
                }

                UserRole::query()->updateOrCreate(
                    ['user_id' => $user->id, 'role_id' => $role->id],
                    ['is_active' => true, 'assigned_at' => now()],
                );
            }
        }
    }
}
