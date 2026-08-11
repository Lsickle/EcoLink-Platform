<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Hallazgo Alto (especialista-seguridad, 2026-07-13): User::hasPermission()
 * solo revisa la cadena de roles/permisos, nunca el estado del propio
 * actor -- una cuenta desactivada o bloqueada con una sesión web ya
 * iniciada seguía pasando todas las Policies hasta que esa sesión
 * expirara sola (deactivate() revoca tokens/sesiones NUEVAS, pero no podía
 * anticipar sesiones ya en curso en otros dispositivos si este middleware
 * no existiera). Se registra en el grupo `auth:sanctum` (ver routes/api.php)
 * -- corre en cada request autenticado, no solo en los endpoints Admin/*.
 *
 * Mismo criterio de "cuenta utilizable" que AuthController::login(): ni
 * bloqueada (`locked_until` no nulo, RN-033) ni en un estado distinto de
 * ACTIVE (`user_statuses.code`).
 *
 * Cambio de contraseña obligatorio en el primer login (confirmado por el
 * usuario, 2026-08-11 -- hallazgo Alto de la revisión de seguridad de la
 * Carga Masiva de Generadores): `users.must_change_password` bloquea aquí,
 * en el mismo punto centralizado, TODA la API salvo las 3 rutas que el
 * propio flujo de cambio necesita (`password.update`, `logout`, `user.me`
 * -- el frontend necesita `GET /user` para saber que debe redirigir a
 * `/change-password`). Defensa en profundidad: el gate real de UX vive en
 * `useRequireAuth()` del frontend; esto solo evita que alguien lo salte
 * llamando la API directo mientras el flag siga activo.
 */
class EnsureUserIsActive
{
    private const ROUTES_ALLOWED_DURING_FORCED_PASSWORD_CHANGE = ['password.update', 'logout', 'user.me'];

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user) {
            if ($user->locked_until !== null) {
                abort(403, 'Cuenta bloqueada.');
            }

            if ($user->status?->code !== 'ACTIVE') {
                abort(403, 'Cuenta inactiva.');
            }

            if ($user->must_change_password && ! $request->routeIs(...self::ROUTES_ALLOWED_DURING_FORCED_PASSWORD_CHANGE)) {
                abort(403, 'Debe cambiar su contraseña antes de continuar.');
            }
        }

        return $next($request);
    }
}
