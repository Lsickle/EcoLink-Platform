<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Artisan;
use RuntimeException;
use UnexpectedValueException;

/**
 * Siembra la cuenta ADMINISTRADOR real del proyecto
 * (luisdelahoz0@gmail.com), para que sobreviva a un reset de la base de
 * datos de desarrollo (`db:seed`).
 *
 * Incidente que motiva este seeder (2026-07-16): antes de este seeder, esa
 * cuenta SOLO se creaba a mano vía {@see \App\Console\Commands\CreateAdminCommand}
 * (`php artisan user:create-admin`) -- nunca quedaba en ningún seeder. Cada
 * vez que alguien reseteaba la BD de desarrollo y corría `db:seed`, la cuenta
 * desaparecía sin aviso y había que recrearla a mano.
 *
 * Reutiliza el propio comando (`Artisan::call`) en vez de reimplementar su
 * lógica (Person + User + PasswordHistory + UserRole + SecurityLog en una
 * transacción, ver docblock de CreateAdminCommand) -- una sola fuente de
 * verdad para el bootstrap del admin, sin duplicar el mecanismo de hash de
 * password ni el criterio de document_type/document_number. El `event_type`
 * del SecurityLog resultante sigue siendo `USER_CREATED_CONSOLE`: la
 * creación real ocurre en el mismo código del comando de consola, este
 * seeder solo decide CUÁNDO invocarlo -- no se inventa un event_type nuevo
 * sin spec fuente que lo pida.
 *
 * Idempotente: si la cuenta ya existe (por el comando, por una corrida
 * previa de este seeder, o por cualquier otro medio), no hace nada -- no
 * falla ni duplica.
 *
 * Requiere que {@see PlatformOrganizationSeeder}, `RoleSeeder` y
 * `UserStatusSeeder` ya hayan corrido (igual que el comando) -- si no,
 * `user:create-admin` falla con su propio mensaje claro y este seeder
 * relanza esa falla en vez de continuar en silencio.
 *
 * Requiere también `PLATFORM_ADMIN_PASSWORD` en el `.env` (config
 * `app.platform_admin_password`) -- la password NO vive hardcodeada en
 * este archivo: una primera versión (2026-07-16) sí la tenía en texto
 * plano, mas se corrigió antes de comitear nada. Si la variable no está
 * seteada, el seeder falla de forma explícita en vez de generar o dejar
 * una password impredecible.
 *
 * Revisión de seguridad (2026-07-16) -- dos hallazgos ALTOS corregidos:
 * - R1: `empty($password)` no detecta el placeholder `changeme` de
 *   `.env.example` -- si alguien copia ese archivo a `.env` sin cambiar la
 *   línea, se sembraría la cuenta admin real con esa password trivial sin
 *   ningún error (y, al ser idempotente, nunca más volvería a advertir).
 *   Se rechaza explícitamente ese valor de ejemplo conocido.
 * - R2: ningún seeder de este proyecto verificaba el entorno de ejecución.
 *   Este seeder siempre pasa `--force` a `user:create-admin`, así que si
 *   `db:seed` llegara a correr fuera de local/testing (staging futuro, CI
 *   futuro) con la variable seteada ahí, crearía la cuenta admin real sin
 *   confirmación humana. Se restringe a local/testing.
 */
class PlatformAdminSeeder extends Seeder
{
    public const ADMIN_EMAIL = 'luisdelahoz0@gmail.com';

    /**
     * Placeholder conocido de `PLATFORM_ADMIN_PASSWORD` en `.env.example`.
     * Si se cambia el placeholder ahí, mantener este valor sincronizado.
     */
    private const EXAMPLE_PLACEHOLDER_PASSWORD = 'changeme';

    public function run(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            throw new RuntimeException(
                'PlatformAdminSeeder: solo puede correr en entornos local o testing -- '
                .'entorno actual: '.app()->environment()
            );
        }

        if (User::query()->where('email', self::ADMIN_EMAIL)->exists()) {
            return;
        }

        $password = config('app.platform_admin_password');

        if (empty($password)) {
            throw new UnexpectedValueException(
                'PlatformAdminSeeder: falta la variable de entorno PLATFORM_ADMIN_PASSWORD '
                .'(config `app.platform_admin_password`). Este seeder no puede crear la cuenta '
                .'admin de plataforma sin una password explícita -- no se genera una al azar '
                .'ni se deja vacía. Setea PLATFORM_ADMIN_PASSWORD en el .env antes de continuar.'
            );
        }

        if (strcasecmp((string) $password, self::EXAMPLE_PLACEHOLDER_PASSWORD) === 0) {
            throw new UnexpectedValueException(
                'PlatformAdminSeeder: PLATFORM_ADMIN_PASSWORD sigue teniendo el valor de ejemplo '
                .'de `.env.example` ("'.self::EXAMPLE_PLACEHOLDER_PASSWORD.'"). Este seeder no puede '
                .'crear la cuenta admin de plataforma con una password trivial/de ejemplo -- '
                .'configura un valor real en PLATFORM_ADMIN_PASSWORD antes de continuar.'
            );
        }

        $exitCode = Artisan::call('user:create-admin', [
            'email' => self::ADMIN_EMAIL,
            '--password' => $password,
            '--first-name' => 'Luis',
            '--last-name' => 'De La Hoz',
            '--force' => true,
        ]);

        if ($exitCode !== 0) {
            throw new RuntimeException(
                'PlatformAdminSeeder: no se pudo crear la cuenta admin de plataforma (\''.self::ADMIN_EMAIL.'\'). '
                .'Salida de `user:create-admin`: '.trim(Artisan::output())
            );
        }
    }
}
