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
 */
class EnsureUserIsActive
{
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
        }

        return $next($request);
    }
}
