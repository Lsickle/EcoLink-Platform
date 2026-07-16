<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PasswordHistory;
use App\Models\SecurityLog;
use App\Models\User;
use App\Notifications\PasswordResetConfirmationNotification;
use App\Services\PasswordResetOtpService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

/**
 * CU-009 (recorte MVP de un spec original de 8 subcasos sobre-diseñado --
 * ver aviso al final de esta clase): recuperación de contraseña por
 * autoservicio en 3 pasos -- forgot() (CU-009.1) -> verifyCode()
 * (CU-009.2) -> reset() (CU-009.4/CU-009.5). CU-009.3 no es un endpoint
 * propio (queda absorbido en el flujo nativo), CU-009.6 (invalidación
 * manual/masiva) y CU-009.8 (historial con RBAC) quedan fuera de alcance
 * hasta que exista RBAC real.
 *
 * Mecanismo: NO usa el facade `Password::` de Laravel (genera tokens de 40
 * caracteres pensados para enlaces, no un código OTP de 6 dígitos que el
 * usuario escribe a mano) -- accede directamente a `password_reset_tokens`
 * (tabla de infraestructura del framework, sin modelo Eloquent, igual que
 * el resto de tablas de Laravel) vía `DB::table()`.
 *
 * RN-031: la contraseña nueva usa la misma política de complejidad que
 * register()/changePassword() (Password::min(8)->letters()->mixedCase()->numbers()).
 * RN-032 (equivalente aquí, ver aviso de AuthController sobre RN-029 a
 * RN-040 como placeholders no verificados): dos capas de defensa contra
 * fuerza bruta del OTP de 6 dígitos -- el rate limiting compartido
 * `password-recovery` (ver AppServiceProvider, techo por IP/IP+email) MÁS
 * un contador `attempts` persistido por código (ver OTP_MAX_ATTEMPTS más
 * abajo, hallazgo Alta de especialista-seguridad 2026-07-13: el rate
 * limiter solo no basta porque no pone techo agregado independiente de la
 * IP de origen).
 * RN-033: si la cuenta estaba bloqueada (`locked_until` no nulo), un reset
 * exitoso la desbloquea -- se considera que probar control del correo
 * verificado satisface la garantía de "personal autorizado" de RN-033
 * aplicada al propio dueño de la cuenta. Se registra como evento DISTINTO
 * (`ACCOUNT_UNLOCKED_VIA_PASSWORD_RESET`) para no confundirlo con un
 * desbloqueo manual real.
 * RN-039: no reutilizar las últimas PasswordHistory recientes (mismo bucle
 * que AuthController::changePassword(), mismo límite compartido).
 * RN-151/CU-009.7: notificación de confirmación tras el reset exitoso --
 * AVISO: el contenido exacto exigido por RN-151 no se pudo verificar de
 * forma independiente en este lote (fuera del alcance de las fuentes
 * disponibles); el mensaje implementado es un criterio propio, sin datos
 * sensibles, señalado aquí para que el hilo principal lo confirme si RN-151
 * exige algo más específico.
 * RN-181: toda respuesta pública de `forgot()` es genérica, sin revelar si
 * el correo existe -- mismo criterio anti-enumeración que login(). La rama
 * "correo no existe" ejecuta un `Hash::make()` dummy (ver forgot()) para
 * igualar el coste de CPU con la rama real y mitigar un canal lateral por
 * tiempo (hallazgo Media, especialista-seguridad 2026-07-13); las
 * notificaciones son `ShouldQueue` por el mismo motivo.
 *
 * AVISO -- revocación de sesión en reset(): `DB::table('sessions')->where(
 * 'user_id', ...)->delete()` asume `SESSION_DRIVER=database` (confirmado en
 * este entorno). Con otro driver (file/redis/array) esa línea es un no-op
 * silencioso -- no revoca nada -- porque las sesiones no viven en esa
 * tabla. Documentado como dependencia conocida (hallazgo especialista-
 * seguridad, no bloqueante), sin test end-to-end todavía.
 */
class PasswordRecoveryController extends Controller
{
    private const PASSWORD_HISTORY_LIMIT = 5;

    /**
     * Hallazgo Alta (especialista-seguridad, 2026-07-13): NO reutilizar
     * `config('auth.passwords.users.expire')` (60 min) para el TTL del OTP
     * -- ese valor está pensado para los tokens de enlace de 40 caracteres
     * del facade `Password::` de Laravel, que este controller decidió no
     * usar (ver aviso de clase). Un código de 6 dígitos (10^6 combinaciones)
     * memorizable por el usuario debe vivir mucho menos tiempo que un
     * enlace: 10 minutos es suficiente para que la persona revise su correo
     * y lo escriba, y acota mucho más la ventana de fuerza bruta que 60.
     *
     * Definida en términos de {@see PasswordResetOtpService::OTP_TTL_MINUTES}
     * -- único punto de verdad del valor, reutilizado también por
     * `UserManagementController::resetPassword()` (CU-006.9). No se duplica
     * el número aquí, solo se referencia.
     */
    private const OTP_TTL_MINUTES = PasswordResetOtpService::OTP_TTL_MINUTES;

    /**
     * Hallazgo Alta (especialista-seguridad, 2026-07-13): mismo umbral que
     * RN-032/RN-033 ya usan para el bloqueo de cuenta en login
     * (AuthController::MAX_FAILED_ATTEMPTS), aplicado aquí por código en
     * vez de por cuenta -- al llegar a este número de intentos fallidos de
     * verificación, el código se invalida (la fila se borra) y el usuario
     * debe solicitar uno nuevo.
     */
    private const OTP_MAX_ATTEMPTS = 5;

    private const GENERIC_REQUEST_MESSAGE = 'Si existe una cuenta asociada a ese correo, recibirás un código de verificación.';

    private const GENERIC_CODE_ERROR_MESSAGE = 'El código es inválido o ha expirado.';

    /**
     * CU-009.1. RN-181: respuesta siempre genérica, exista o no el correo.
     */
    public function forgot(Request $request)
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
        ]);

        $email = $this->normalizeEmail($data['email']);
        $user = $this->findUserByEmail($email);

        if ($user) {
            // Extraído a PasswordResetOtpService::issueFor() (mismo criterio
            // que UserProvisioningService) -- reutilizado tal cual por
            // UserManagementController::resetPassword() (CU-006.9). El
            // hallazgo Baja-Media (especialista-seguridad, 2026-07-13,
            // `upsert()` atómico vs. `updateOrInsert()`) vive ahora dentro
            // del servicio, no se duplica aquí.
            PasswordResetOtpService::issueFor($user);

            $this->logSecurityEvent($request, 'PASSWORD_RESET_REQUESTED', 'SUCCESS', 'Solicitud de código de recuperación de contraseña.', $user);
        } else {
            // Hallazgo Media (especialista-seguridad, 2026-07-13): dummy
            // Hash::make() para igualar el coste de CPU (~100+ ms de bcrypt)
            // de la rama "correo existe" -- sin esto, la diferencia de
            // latencia entre ambas ramas permite enumerar correos pese al
            // mensaje de respuesta genérico. El valor hasheado se descarta,
            // solo importa el coste computacional.
            Hash::make(Str::random(6));

            // RN-181: mismo patrón que login() para "usuario no encontrado"
            // -- no se pierde visibilidad de abuso en la auditoría interna
            // aunque la respuesta pública no lo revele.
            $this->logSecurityEvent($request, 'PASSWORD_RESET_REQUESTED', 'FAILURE', 'Correo no asociado a ninguna cuenta.');
        }

        return response()->json(['message' => self::GENERIC_REQUEST_MESSAGE]);
    }

    /**
     * CU-009.2. No borra el código todavía si es válido -- se necesita de
     * nuevo en reset() (validación en dos pantallas, un solo código
     * persistido).
     */
    public function verifyCode(Request $request)
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'code' => ['required', 'digits:6'],
        ]);

        $email = $this->normalizeEmail($data['email']);

        if (! $this->consumeOtpAttempt($email, $data['code'])) {
            $this->logSecurityEvent($request, 'PASSWORD_RESET_CODE_INVALID', 'FAILURE', 'Código de recuperación inválido o expirado.', $this->findUserByEmail($email));

            throw ValidationException::withMessages(['code' => [self::GENERIC_CODE_ERROR_MESSAGE]]);
        }

        return response()->json(['verified' => true]);
    }

    /**
     * CU-009.4/CU-009.5. Independiente e idempotente en su propia
     * validación -- no confía en un estado "ya verificado" del cliente,
     * revalida el código exactamente igual que verifyCode().
     */
    public function reset(Request $request)
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'code' => ['required', 'digits:6'],
            'password' => ['required', 'confirmed', Password::min(8)->letters()->mixedCase()->numbers()],
        ]);

        $email = $this->normalizeEmail($data['email']);
        $user = $this->findUserByEmail($email);

        if (! $user || ! $this->consumeOtpAttempt($email, $data['code'])) {
            $this->logSecurityEvent($request, 'PASSWORD_RESET_CODE_INVALID', 'FAILURE', 'Código de recuperación inválido o expirado.', $user);

            throw ValidationException::withMessages(['code' => [self::GENERIC_CODE_ERROR_MESSAGE]]);
        }

        // RN-039: mismo bucle que AuthController::changePassword().
        $recentHashes = PasswordHistory::query()
            ->where('user_id', $user->id)
            ->latest('created_at')
            ->limit(self::PASSWORD_HISTORY_LIMIT)
            ->pluck('password_hash');

        foreach ($recentHashes as $hash) {
            if (Hash::check($data['password'], $hash)) {
                throw ValidationException::withMessages([
                    'password' => ['No puedes reutilizar una de tus últimas '.self::PASSWORD_HISTORY_LIMIT.' contraseñas.'],
                ]);
            }
        }

        $wasLocked = $user->locked_until !== null;

        $user->forceFill(['password_hash' => $data['password']])->save();

        PasswordHistory::query()->create([
            'user_id' => $user->id,
            'password_hash' => $user->password_hash,
        ]);

        // Uso único: el código ya no sirve tras un reset exitoso.
        DB::table('password_reset_tokens')->where('email', $email)->delete();

        // A diferencia de changePassword() (usuario ya autenticado, se
        // preserva el token Bearer actual), este es un flujo NO autenticado
        // -- no hay "token actual" que preservar. Se revoca todo.
        //
        // AVISO -- asume SESSION_DRIVER=database, ver aviso de clase.
        $user->tokens()->delete();
        DB::table('sessions')->where('user_id', $user->id)->delete();

        if ($wasLocked) {
            $user->forceFill(['locked_until' => null, 'failed_login_attempts' => 0])->save();

            $this->logSecurityEvent($request, 'ACCOUNT_UNLOCKED_VIA_PASSWORD_RESET', 'SUCCESS', 'Cuenta desbloqueada tras restablecer contraseña vía autoservicio.', $user);
        }

        $this->logSecurityEvent($request, 'PASSWORD_RESET_SUCCESS', 'SUCCESS', 'Contraseña restablecida vía autoservicio.', $user);

        $user->notify(new PasswordResetConfirmationNotification);

        return response()->json(['message' => 'Tu contraseña ha sido actualizada correctamente.']);
    }

    /**
     * RN-181: normaliza el correo (trim + lowercase) tanto para la llave de
     * `password_reset_tokens` como para la búsqueda de usuario -- evita que
     * variaciones de mayúsculas/minúsculas abran caminos de enumeración o
     * dupliquen filas para el "mismo" correo.
     */
    private function normalizeEmail(string $email): string
    {
        return Str::lower(trim($email));
    }

    private function findUserByEmail(string $normalizedEmail): ?User
    {
        return User::query()->whereRaw('LOWER(email) = ?', [$normalizedEmail])->first();
    }

    private function findResetTokenRow(string $normalizedEmail): ?object
    {
        return DB::table('password_reset_tokens')->where('email', $normalizedEmail)->first();
    }

    /**
     * Valida el código contra la fila de `password_reset_tokens` del
     * correo y, si es incorrecto, incrementa `attempts` -- al llegar a
     * OTP_MAX_ATTEMPTS borra la fila (código inutilizado, ver aviso de
     * clase sobre RN-032). Un código expirado también borra la fila de una
     * vez (ya no sirve, no tiene sentido dejarlo con intentos disponibles).
     *
     * Efecto secundario intencional -- este método MUTA estado en cada
     * llamada (no es una consulta idempotente): cada intento con código
     * incorrecto consume un cupo de OTP_MAX_ATTEMPTS, incluso si el
     * llamador solo estaba "verificando" (verifyCode()) y no fue el intento
     * final de reset().
     */
    private function consumeOtpAttempt(string $normalizedEmail, string $code): bool
    {
        $tokenRow = $this->findResetTokenRow($normalizedEmail);

        if (! $tokenRow) {
            return false;
        }

        $expiresAt = Carbon::parse($tokenRow->created_at)->addMinutes(self::OTP_TTL_MINUTES);

        if ($expiresAt->isPast()) {
            DB::table('password_reset_tokens')->where('email', $normalizedEmail)->delete();

            return false;
        }

        if (Hash::check($code, $tokenRow->token)) {
            return true;
        }

        $attempts = $tokenRow->attempts + 1;

        if ($attempts >= self::OTP_MAX_ATTEMPTS) {
            DB::table('password_reset_tokens')->where('email', $normalizedEmail)->delete();
        } else {
            DB::table('password_reset_tokens')->where('email', $normalizedEmail)->update(['attempts' => $attempts]);
        }

        return false;
    }

    /**
     * Mismo patrón que AuthController::logSecurityEvent() -- registro
     * append-only en `security_logs`, nunca con la contraseña/código en
     * texto plano.
     */
    private function logSecurityEvent(Request $request, string $eventType, string $result, string $description, ?User $user = null): void
    {
        SecurityLog::query()->create([
            'tenant_organization_id' => $user?->tenant_organization_id,
            'user_id' => $user?->id,
            'person_id' => $user?->person_id,
            'event_type' => $eventType,
            'result' => $result,
            'description' => $description,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'risk_level' => $result === 'FAILURE' ? 'MEDIUM' : 'LOW',
        ]);
    }
}
