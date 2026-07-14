<?php

namespace App\Console\Commands;

use App\Models\SecurityLog;
use App\Models\User;
use Illuminate\Console\Command;

/**
 * RN-033: "Los usuarios bloqueados solo podrán ser habilitados por personal
 * autorizado" -- sin RBAC todavía, no existe una vía segura de exponer el
 * desbloqueo como endpoint HTTP (ver AVISO en AuthController). Este comando
 * Artisan es la vía operativa temporal acordada con especialista-seguridad
 * (2026-07-13): por naturaleza requiere acceso de shell/servidor, no queda
 * expuesto por HTTP.
 */
class UnlockUserCommand extends Command
{
    protected $signature = 'user:unlock
        {login : Username o email del usuario a desbloquear}
        {--force : Omite la confirmación interactiva (uso en scripts/no interactivo).}';

    protected $description = 'Desbloquea manualmente una cuenta bloqueada por RN-033 (uso exclusivo de personal autorizado con acceso de servidor).';

    public function handle(): int
    {
        $login = $this->argument('login');

        $user = User::query()
            ->where('username', $login)
            ->orWhere('email', $login)
            ->first();

        if (! $user) {
            $this->error("No se encontró ningún usuario con username o email '{$login}'.");

            return self::FAILURE;
        }

        if ($user->locked_until === null) {
            $this->info("El usuario '{$login}' no está bloqueado actualmente -- nada que hacer.");

            return self::SUCCESS;
        }

        // Hallazgo Media/Baja (especialista-seguridad, 2026-07-13, segunda
        // pasada): el comando ejecutaba el desbloqueo sin ningún paso de
        // confirmación -- un error de tipeo en `login` (p. ej. autocompletado
        // de shell hacia otra cuenta) desbloqueaba la cuenta equivocada sin
        // oportunidad de detenerse. `--force` permite seguir usándolo sin
        // interacción (scripts, este mismo test suite).
        if (! $this->option('force') && ! $this->confirm("¿Confirmas desbloquear la cuenta de {$user->username}?")) {
            $this->warn('Operación cancelada -- la cuenta sigue bloqueada.');

            return self::FAILURE;
        }

        $user->forceFill([
            'locked_until' => null,
            'failed_login_attempts' => 0,
        ])->save();

        // RN-034/RN-035: toda acción de desbloqueo queda auditada. No hay
        // usuario autenticado que registrar como actor (es una acción de
        // consola) -- user_id/person_id identifican la cuenta DESBLOQUEADA,
        // no un actor, igual que el resto de eventos de este catálogo.
        //
        // Hallazgo Media/Baja (especialista-seguridad, 2026-07-13, segunda
        // pasada): `security_logs` no tiene una columna de actor para
        // acciones de consola (ver esquema-bd) -- se captura el usuario del
        // sistema operativo como mejor esfuerzo y se agrega a la
        // descripción existente, sin inventar una columna nueva.
        SecurityLog::query()->create([
            'tenant_organization_id' => $user->tenant_organization_id,
            'user_id' => $user->id,
            'person_id' => $user->person_id,
            'event_type' => 'ACCOUNT_UNLOCKED_MANUAL',
            'result' => 'SUCCESS',
            'description' => 'Cuenta desbloqueada manualmente vía comando Artisan user:unlock (RN-033). '
                ."Ejecutado por (SO): {$this->osActor()}.",
            'risk_level' => 'LOW',
        ]);

        $this->info("Usuario '{$login}' desbloqueado correctamente. Intentos fallidos reiniciados a 0.");

        return self::SUCCESS;
    }

    /**
     * Mejor esfuerzo para identificar quién ejecutó el comando: no hay
     * usuario autenticado de la app (acción de consola), así que se recurre
     * al usuario del sistema operativo -- `get_current_user()` (dueño del
     * script en ejecución) con fallback a la variable de entorno `USER`
     * (Unix/Linux) o `USERNAME` (Windows) si aquel no resuelve nada.
     */
    private function osActor(): string
    {
        $envVar = PHP_OS_FAMILY === 'Windows' ? 'USERNAME' : 'USER';

        $actor = get_current_user() ?: '';

        if ($actor === '') {
            $actor = (string) (getenv($envVar) ?: '');
        }

        return $actor !== '' ? $actor : 'desconocido';
    }
}
