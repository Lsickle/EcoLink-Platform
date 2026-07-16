<?php

namespace App\Console\Commands;

use App\Models\Organization;
use App\Models\PasswordHistory;
use App\Models\Person;
use App\Models\Role;
use App\Models\SecurityLog;
use App\Models\User;
use App\Models\UserRole;
use App\Models\UserStatus;
use Database\Seeders\PlatformOrganizationSeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Mecanismo de invitación (reemplaza el registro público de
 * AuthController::register(), eliminado): sin ningún admin ya sembrado, no
 * hay quien invite al primer usuario -- este comando resuelve el mismo
 * problema "huevo-gallina" que {@see AssignRoleCommand}, pero crea la cuenta
 * completa (Person+User+rol ADMINISTRADOR) en vez de solo asignar un rol a
 * un usuario ya existente. Consola = confiable (RN-181 no aplica al operador
 * que corre `php artisan`): el usuario nace `ACTIVE` directo, SIN invitación
 * -- no tiene sentido invitarse a sí mismo por correo desde la terminal.
 *
 * `--first-name=`/`--last-name=` (defaults "Admin"/"EcoLink") y el
 * `document_number` generado son criterio propio de este lote -- este
 * comando es puro bootstrap de infraestructura, no pretende modelar una
 * persona real; sin spec fuente que lo cubra, señalado en el resumen.
 *
 * Hallazgo Alto (especialista-seguridad, 2026-07-14): el primer admin
 * bootstrapeado por este comando necesita poder gestionar la cola de
 * solicitudes de invitación desde el día uno (ver
 * InvitationRequestController::isPlatformStaff()) -- se asigna
 * `tenant_organization_id` a la organización PLATAFORMA sembrada por
 * {@see PlatformOrganizationSeeder}. Falla con mensaje explícito si ese
 * seeder no ha corrido todavía (no se crea la organización aquí -- este
 * comando no es responsable de eso).
 */
class CreateAdminCommand extends Command
{
    protected $signature = 'user:create-admin
        {email : Email del administrador a crear}
        {--password= : Contraseña a usar. Si se omite, se genera una segura de 16 caracteres.}
        {--first-name=Admin : Nombre de la persona asociada (bootstrap, sin spec fuente).}
        {--last-name=EcoLink : Apellido de la persona asociada (bootstrap, sin spec fuente).}
        {--force : Omite la confirmación interactiva (uso en scripts/no interactivo).}';

    protected $description = 'Crea el primer usuario ADMINISTRADOR (ACTIVE, sin invitación) -- bootstrap de consola cuando todavía no existe ningún admin.';

    public function handle(): int
    {
        $email = (string) $this->argument('email');

        if (User::query()->where('email', $email)->exists()) {
            $this->error("Ya existe un usuario con email '{$email}'.");

            return self::FAILURE;
        }

        $role = Role::query()->where('code', 'ADMINISTRADOR')->first();

        if (! $role) {
            $this->error("No se encontró el rol 'ADMINISTRADOR' -- corre el seeder de roles primero.");

            return self::FAILURE;
        }

        $activeStatus = UserStatus::query()->where('code', 'ACTIVE')->first();

        if (! $activeStatus) {
            $this->error("No se encontró el estado 'ACTIVE' -- corre el seeder de user_statuses primero.");

            return self::FAILURE;
        }

        $platformOrganization = Organization::query()->where('tax_id', PlatformOrganizationSeeder::PLATFORM_TAX_ID)->first();

        if (! $platformOrganization) {
            $this->error('No se encontró la organización plataforma -- corre `php artisan db:seed --class=Database\\Seeders\\PlatformOrganizationSeeder` primero.');

            return self::FAILURE;
        }

        $providedPassword = $this->option('password');
        $password = $providedPassword ?: Str::password(16);

        if (! $this->option('force') && ! $this->confirm("¿Confirmas crear el administrador '{$email}'?")) {
            $this->warn('Operación cancelada -- no se creó ningún usuario.');

            return self::FAILURE;
        }

        $user = DB::transaction(function () use ($email, $password, $activeStatus, $role, $platformOrganization) {
            $person = Person::query()->create([
                'document_type' => 'CC',
                'document_number' => 'ADMIN-'.Str::upper(Str::random(10)),
                'first_name' => (string) $this->option('first-name'),
                'last_name' => (string) $this->option('last-name'),
                'email' => $email,
            ]);

            $user = User::query()->create([
                'tenant_organization_id' => $platformOrganization->id,
                'person_id' => $person->id,
                'username' => Str::slug(Str::before($email, '@')).'-'.Str::lower(Str::random(6)),
                'email' => $email,
                'password_hash' => $password,
                'user_status_id' => $activeStatus->id,
            ]);

            PasswordHistory::query()->create([
                'user_id' => $user->id,
                'password_hash' => $user->password_hash,
            ]);

            UserRole::query()->create([
                'user_id' => $user->id,
                'role_id' => $role->id,
                'assigned_at' => now(),
                'is_active' => true,
            ]);

            return $user;
        });

        // RN-038: acción de consola queda auditada -- sin actor autenticado
        // de la app, user_id identifica la cuenta AFECTADA/creada (mismo
        // criterio que AssignRoleCommand). Un solo evento combinado
        // (creación + asignación de rol) en vez de dos: ambos ocurren
        // atómicamente en la misma transacción -- criterio propio de este
        // lote, documentado en vez de asumido en silencio.
        SecurityLog::query()->create([
            'user_id' => $user->id,
            'person_id' => $user->person_id,
            'event_type' => 'USER_CREATED_CONSOLE',
            'result' => 'SUCCESS',
            'description' => "Administrador '{$email}' creado vía comando de consola user:create-admin, con rol ADMINISTRADOR asignado.",
            'risk_level' => 'LOW',
        ]);

        $this->info("Administrador '{$email}' creado correctamente con rol ADMINISTRADOR.");

        if (! $providedPassword) {
            $this->warn("Contraseña generada: {$password}");
            $this->warn('Guárdala ahora -- no se volverá a mostrar.');
        }

        return self::SUCCESS;
    }
}
