<?php

namespace App\Console\Commands;

use App\Models\Role;
use App\Models\SecurityLog;
use App\Models\User;
use App\Models\UserRole;
use Illuminate\Console\Command;

/**
 * RN-027/CU-006.7: todo usuario debe tener al menos un rol, pero los
 * endpoints de RoleController::assignToUser() están gateados por
 * `roles.assign` -- huevo-gallina, hace falta un ADMINISTRADOR ya asignado
 * para poder usarlos. Este comando permite dar el primer rol (típicamente
 * ADMINISTRADOR, ver database/seeders/RoleSeeder.php) a un usuario real
 * desde consola, mismo patrón operativo que UnlockUserCommand.
 */
class AssignRoleCommand extends Command
{
    protected $signature = 'user:assign-role
        {email : Email del usuario a quien se le asignará el rol}
        {role : Código del rol a asignar (p. ej. ADMINISTRADOR)}
        {--force : Omite la confirmación interactiva (uso en scripts/no interactivo).}';

    protected $description = 'Asigna un rol (p. ej. ADMINISTRADOR) a un usuario existente por email -- uso: php artisan user:assign-role admin@ejemplo.com ADMINISTRADOR';

    public function handle(): int
    {
        $email = $this->argument('email');
        $roleCode = strtoupper((string) $this->argument('role'));

        $user = User::query()->where('email', $email)->first();

        if (! $user) {
            $this->error("No se encontró ningún usuario con email '{$email}'.");

            return self::FAILURE;
        }

        $role = Role::query()->where('code', $roleCode)->first();

        if (! $role) {
            $this->error("No se encontró ningún rol con código '{$roleCode}'. Roles disponibles: "
                .Role::query()->pluck('code')->implode(', '));

            return self::FAILURE;
        }

        $alreadyAssigned = UserRole::query()
            ->where('user_id', $user->id)
            ->where('role_id', $role->id)
            ->where('is_active', true)
            ->exists();

        if ($alreadyAssigned) {
            $this->info("El usuario '{$email}' ya tiene asignado el rol '{$roleCode}' -- nada que hacer.");

            return self::SUCCESS;
        }

        if (! $this->option('force') && ! $this->confirm("¿Confirmas asignar el rol '{$roleCode}' al usuario '{$email}'?")) {
            $this->warn('Operación cancelada -- no se asignó ningún rol.');

            return self::FAILURE;
        }

        UserRole::query()->updateOrCreate(
            ['user_id' => $user->id, 'role_id' => $role->id],
            ['assigned_at' => now(), 'is_active' => true],
        );

        // RN-038: toda asignación de rol queda auditada, igual que
        // UnlockUserCommand -- sin actor autenticado de la app (acción de
        // consola), user_id identifica la cuenta AFECTADA, no un actor.
        SecurityLog::query()->create([
            'tenant_organization_id' => $user->tenant_organization_id,
            'user_id' => $user->id,
            'person_id' => $user->person_id,
            'event_type' => 'ROLE_ASSIGNED_CONSOLE',
            'result' => 'SUCCESS',
            'description' => "Rol '{$roleCode}' asignado manualmente vía comando Artisan user:assign-role.",
            'risk_level' => 'LOW',
        ]);

        $this->info("Rol '{$roleCode}' asignado correctamente al usuario '{$email}'.");

        return self::SUCCESS;
    }
}
