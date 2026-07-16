<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PasswordHistory;
use App\Models\SecurityLog;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * RN-181: Sanctum como mecanismo de autenticación -- cookie de sesión
 * stateful para el SPA web, token Bearer (personal_access_tokens) para la
 * app móvil. El mismo endpoint de login decide el modo según si el cliente
 * manda `device_name` (móvil) o no (web).
 *
 * Mecanismo de invitación (reemplaza el registro público): `register()` se
 * ELIMINÓ de esta clase -- ya no existe alta pública de usuarios. Un usuario
 * nace `PENDING_ACTIVATION` vía `Admin\UserManagementController::store()`
 * (creado por un admin) o el comando de consola `user:create-admin`
 * (bootstrap, nace `ACTIVE` directo), y activa su propia cuenta vía
 * `InvitationController::accept()`. Ver esos archivos para el detalle.
 *
 * RN-033: "Los usuarios bloqueados solo podrán ser habilitados por personal
 * autorizado" -- sin desbloqueo automático por tiempo. `locked_until` se usa
 * solo como marca informativa de CUÁNDO se bloqueó la cuenta, no como
 * expiración: una vez bloqueada (no nula), la cuenta sigue bloqueada sin
 * importar cuánto tiempo pase. No se construye un endpoint de desbloqueo en
 * este lote -- RBAC/roles reales todavía no existen, y un endpoint sin poder
 * restringirlo a "personal autorizado" de verdad sería un hueco de
 * seguridad, no una solución (queda bloqueado hasta que exista ese hito).
 *
 * RN-034/RN-035: toda autenticación exitosa o fallida se registra en
 * `security_logs` vía {@see logSecurityEvent()}. También se registra el
 * logout y el cambio de contraseña, sin loguear contraseñas en texto plano.
 *
 * AVISO -- varios valores de esta clase son placeholders explícitos
 * pendientes de verificar contra el texto real de RN-029 a RN-040
 * (contraseñas, bloqueo por intentos, expiración de sesión), que no
 * estaban disponibles al escribir este código:
 *   - Política de complejidad de contraseña (Password::min(8) + reglas).
 *   - Umbral de bloqueo: 5 intentos fallidos (MAX_FAILED_ATTEMPTS).
 *   - N=5 contraseñas recientes no reutilizables (RN-039, asumido también
 *     como placeholder por esquema-bd mismo, no confirmado con negocio).
 * No tratar estos números como definitivos sin confirmarlos.
 */
class AuthController extends Controller
{
    private const MAX_FAILED_ATTEMPTS = 5;

    private const PASSWORD_HISTORY_LIMIT = 5;

    /**
     * Hallazgo Alta (especialista-seguridad, 2026-07-13): `createToken()` no
     * fijaba expiración (`config('sanctum.expiration')` es null), dejando un
     * token Bearer robado/perdido válido para siempre.
     *
     * Ajuste (especialista-seguridad, 2026-07-13, segunda pasada): el valor
     * inicial de 30 días se consideró largo para el perfil de datos de este
     * sistema (RESPEL, datos personales) combinado con el perfil de riesgo
     * de los dispositivos que lo consumen (móviles de campo, con más
     * probabilidad de pérdida/robo que un equipo de oficina). Se reduce a
     * 14 días: dentro del rango 7-14 sugerido por la revisión, en el
     * extremo que sigue permitiendo una sesión "recordada" razonable para
     * operarios de campo sin forzar reautenticación diaria -- sigue siendo
     * un criterio propio de este lote, no confirmado con negocio.
     */
    private const MOBILE_TOKEN_TTL_DAYS = 14;

    public function login(Request $request)
    {
        $credentials = $request->validate([
            'login' => ['required', 'string'], // username o email
            'password' => ['required', 'string'],
            'device_name' => ['sometimes', 'string', 'max:255'],
        ]);

        $user = User::query()
            ->where('username', $credentials['login'])
            ->orWhere('email', $credentials['login'])
            ->first();

        if (! $user) {
            $this->logSecurityEvent($request, 'LOGIN_FAILED', 'FAILURE', 'Credenciales inválidas (usuario no encontrado).');

            throw ValidationException::withMessages(['login' => ['Credenciales inválidas.']]);
        }

        // RN-033: bloqueo binario y manual -- una vez bloqueada (locked_until
        // no nulo), la cuenta sigue bloqueada sin importar el tiempo
        // transcurrido. Sin auto-desbloqueo por expiración.
        if ($user->locked_until !== null) {
            $this->logSecurityEvent($request, 'LOGIN_FAILED', 'FAILURE', 'Cuenta bloqueada, requiere habilitación por personal autorizado.', $user);

            throw ValidationException::withMessages([
                'login' => ['Cuenta bloqueada. Solo puede ser habilitada por personal autorizado.'],
            ]);
        }

        if ($user->status->code !== 'ACTIVE') {
            $this->logSecurityEvent($request, 'LOGIN_FAILED', 'FAILURE', 'Cuenta inactiva.', $user);

            throw ValidationException::withMessages(['login' => ['La cuenta no está activa.']]);
        }

        if (! Hash::check($credentials['password'], $user->password_hash)) {
            $this->registerFailedAttempt($user);
            $this->logSecurityEvent($request, 'LOGIN_FAILED', 'FAILURE', 'Credenciales inválidas.', $user);

            throw ValidationException::withMessages(['login' => ['Credenciales inválidas.']]);
        }

        $user->forceFill([
            'failed_login_attempts' => 0,
            'last_login_at' => now(),
        ])->save();

        $this->logSecurityEvent($request, 'LOGIN_SUCCESS', 'SUCCESS', 'Inicio de sesión exitoso.', $user);

        // Móvil: el cliente manda device_name -> token Bearer con
        // expiración (hallazgo Alta, ver aviso de MOBILE_TOKEN_TTL_DAYS).
        if ($request->filled('device_name')) {
            $token = $user->createToken(
                $credentials['device_name'],
                ['*'],
                now()->addDays(self::MOBILE_TOKEN_TTL_DAYS),
            )->plainTextToken;

            return response()->json([
                'user' => $user->only(['id', 'uuid', 'username', 'email']),
                'token' => $token,
            ]);
        }

        // Web SPA: sesión stateful (cookie), sin token expuesto.
        Auth::login($user);
        $request->session()->regenerate();

        return response()->json([
            'user' => $user->only(['id', 'uuid', 'username', 'email']),
        ]);
    }

    public function logout(Request $request)
    {
        $user = $request->user();

        // Sanctum::currentAccessToken() devuelve un TransientToken (no null)
        // para peticiones autenticadas por sesión (web stateful) -- solo el
        // caso móvil trae una PersonalAccessToken real que se pueda borrar.
        $token = $user?->currentAccessToken();

        if ($token instanceof PersonalAccessToken) {
            $token->delete();
        } else {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        $this->logSecurityEvent($request, 'LOGOUT', 'SUCCESS', 'Cierre de sesión.', $user);

        return response()->json(['message' => 'Sesión cerrada.']);
    }

    /**
     * Hallazgo `especialista-seguridad` sobre el FRONTEND (2026-07-13): el
     * payload solo exponía `roles` ({id, code, name}), sin capacidades --
     * el frontend no podía decidir qué ocultar en el menú de administración
     * sin esa información. Se agrega `permissions`: un array plano de
     * códigos, unión de todos los permisos de todos los roles activos del
     * usuario, vía {@see User::effectivePermissionCodes()}.
     *
     * Hallazgo Alto (especialista-seguridad, 2026-07-14, revisión del
     * mecanismo de invitación): se agrega `is_platform_staff` (vía
     * {@see User::isPlatformStaff()}) -- el frontend lo necesita para ocultar
     * la pantalla de solicitudes de invitación a admins que no son staff de
     * la organización plataforma (defensa en profundidad, el backend ya
     * rechaza con 403, ver InvitationRequestController).
     */
    public function me(Request $request)
    {
        $user = $request->user()->load('person', 'organization', 'roles');

        return response()->json([
            'user' => $user->toArray() + [
                'permissions' => $user->effectivePermissionCodes(),
                'is_platform_staff' => $user->isPlatformStaff(),
            ],
        ]);
    }

    /**
     * RN-039: no reutilizar las últimas PASSWORD_HISTORY_LIMIT contraseñas
     * (umbral placeholder, ver aviso de clase).
     */
    public function changePassword(Request $request)
    {
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'confirmed', Password::min(8)->letters()->mixedCase()->numbers()],
        ]);

        $user = $request->user();

        if (! Hash::check($data['current_password'], $user->password_hash)) {
            throw ValidationException::withMessages(['current_password' => ['La contraseña actual no es correcta.']]);
        }

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

        // Hallazgo Media-Alta (especialista-seguridad, 2026-07-13): DEBE ir
        // antes de persistir la contraseña nueva -- ver aviso en
        // revokeOtherWebSessions() sobre por qué el orden importa aquí.
        $this->revokeOtherWebSessions($data['current_password']);

        $user->forceFill(['password_hash' => $data['password']])->save();

        PasswordHistory::query()->create([
            'user_id' => $user->id,
            'password_hash' => $user->password_hash,
        ]);

        $this->revokeOtherBearerTokens($user);

        $this->logSecurityEvent($request, 'PASSWORD_CHANGED', 'SUCCESS', 'Cambio de contraseña.', $user);

        return response()->json(['message' => 'Contraseña actualizada.']);
    }

    /**
     * Hallazgo Media-Alta (especialista-seguridad, 2026-07-13): cambiar la
     * contraseña no expulsaba sesiones web ya comprometidas. Invalida las
     * demás sesiones web del usuario vía Auth::logoutOtherDevices() -- el
     * mecanismo estándar de Laravel para esto, que requiere la contraseña
     * actual (ya validada por Hash::check() más arriba en changePassword()).
     * Si el request no está autenticado por sesión web (p. ej. token Bearer
     * móvil), es un no-op seguro: SessionGuard::logoutOtherDevices() revisa
     * primero si hay un usuario resuelto en el guard 'web' y retorna de
     * inmediato si no lo hay.
     *
     * AVISO -- se pide explícitamente el guard 'web', no el guard por
     * defecto: dentro de una request autenticada vía middleware
     * `auth:sanctum`, `Illuminate\Auth\Middleware\Authenticate` llama
     * internamente `Auth::shouldUse('sanctum')`, así que el guard por
     * defecto de esta request pasa a ser 'sanctum' (un RequestGuard, sin
     * `logoutOtherDevices()`) -- `Auth::logoutOtherDevices()` sin argumento
     * de guard fallaría con un BadMethodCallException.
     *
     * AVISO DE ORDEN -- debe llamarse ANTES de guardar la contraseña nueva
     * en `$user`, no después: internamente, Laravel vuelve a hashear la
     * contraseña recibida (la ACTUAL, no la nueva) y la GUARDA sobre el
     * mismo registro de usuario (fuerza un rehash con force:true, para
     * cambiar el valor del hash aunque el texto plano no cambie -- así
     * detectan la invalidación las demás sesiones vía
     * AuthenticateSession::validatePasswordHash()). Si se llamara después
     * de guardar la contraseña nueva, ese guardado interno la
     * sobrescribiría de vuelta a un hash de la contraseña VIEJA. Llamado
     * antes, ese efecto secundario queda inmediatamente reemplazado por el
     * guardado real de la contraseña nueva, justo debajo en el flujo.
     */
    private function revokeOtherWebSessions(string $currentPassword): void
    {
        Auth::guard('web')->logoutOtherDevices($currentPassword);
    }

    /**
     * Hallazgo Media-Alta (especialista-seguridad, 2026-07-13): cambiar la
     * contraseña no expulsaba tokens Bearer móviles ya comprometidos.
     * Criterio de este lote: se conserva vigente el token usado en ESTA
     * request (para no forzar un re-login inmediato de quien acaba de
     * demostrar conocer la contraseña actual) y se revocan todos los demás.
     *
     * `currentAccessToken()` devuelve un TransientToken (no una fila real de
     * `personal_access_tokens`) para requests autenticados por sesión web --
     * en ese caso no hay token Bearer "actual" que preservar, así que se
     * revocan TODOS los tokens Bearer del usuario (todas sus sesiones
     * móviles quedan invalidadas junto con el resto de sesiones web, ver
     * revokeOtherWebSessions()).
     */
    private function revokeOtherBearerTokens(User $user): void
    {
        $currentToken = $user->currentAccessToken();

        $user->tokens()
            ->when(
                $currentToken instanceof PersonalAccessToken,
                fn ($query) => $query->where('id', '!=', $currentToken->id),
            )
            ->delete();
    }

    /**
     * RN-029/RN-040 (placeholder, ver aviso de clase): incrementa el
     * contador de intentos fallidos y bloquea tras MAX_FAILED_ATTEMPTS.
     *
     * RN-033: `locked_until` deja de ser una expiración -- una vez fijado,
     * solo se limpia por acción explícita de personal autorizado (fuera de
     * alcance de este lote, ver aviso de clase). Aquí solo registra CUÁNDO
     * se bloqueó la cuenta.
     */
    private function registerFailedAttempt(User $user): void
    {
        $attempts = $user->failed_login_attempts + 1;

        $user->forceFill([
            'failed_login_attempts' => $attempts,
            'locked_until' => $attempts >= self::MAX_FAILED_ATTEMPTS
                ? now()
                : $user->locked_until,
        ])->save();
    }

    /**
     * RN-034/RN-035: registra en `security_logs` toda autenticación exitosa
     * o fallida (también logout y cambio de password, ver llamadas en esta
     * clase). Nunca recibe ni persiste la contraseña en texto plano.
     *
     * AVISO -- el catálogo exacto de `event_type`/`risk_level` no está
     * confirmado con negocio, ver aviso en SecurityLog.
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
