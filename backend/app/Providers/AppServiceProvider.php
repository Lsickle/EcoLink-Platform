<?php

namespace App\Providers;

use App\Models\User;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureRateLimiting();
    }

    /**
     * Hallazgo CRÍTICO (revisión especialista-seguridad, 2026-07-13):
     * /api/login (y, en su momento, /api/register -- eliminado junto con el
     * registro público, ver AuthController) no tenían ningún límite de tasa,
     * lo que permitía fuerza bruta distribuida (evitando el umbral de
     * bloqueo por cuenta de RN-033 atacando muchas cuentas distintas desde
     * el mismo origen) y DoS por el costo de CPU de bcrypt (rounds=12) sin
     * límite de requests. `invitation-accept` (mecanismo de invitación que
     * reemplaza el registro) lleva el mismo tratamiento desde su creación.
     */
    private function configureRateLimiting(): void
    {
        // Limit #1, por IP + valor del campo `login` combinados: limita
        // cuántos intentos por minuto puede hacer un mismo origen contra la
        // MISMA cuenta, además del bloqueo binario de RN-033 (5 intentos
        // fallidos). Se usa 10/min, no 5, a propósito: RN-033 ya bloquea la
        // cuenta al 5º intento fallido, y verificar ese comportamiento
        // (incluyendo el intento adicional que confirma que sigue
        // bloqueada) requiere 6 requests contra la misma cuenta en un solo
        // flujo -- un límite de 5 chocaría con ese caso legítimo.
        //
        // Limit #2, hallazgo Alta (especialista-seguridad, 2026-07-13,
        // segunda pasada): el Limit #1 protege una cuenta puntual contra
        // fuerza bruta, pero no evita "password spraying" -- un atacante
        // desde una sola IP probando contraseñas comunes contra miles de
        // cuentas DISTINTAS, ninguna de las cuales individualmente supera el
        // balde de 10/min. RateLimiter::for() acepta devolver un array de
        // Limit; Laravel aplica el más restrictivo que se supere. Este
        // segundo Limit, por IP sola (sin combinar con `login`), actúa como
        // techo agregado: 30/min es un criterio propio de este lote, alto
        // para no afectar tráfico legítimo agregado (varias personas detrás
        // de la misma IP/NAT corporativa) pero suficiente para acotar el
        // volumen de spraying posible por minuto -- no está confirmado con
        // negocio.
        RateLimiter::for('login', function (Request $request) {
            return [
                Limit::perMinute(10)->by($request->ip().'|'.$request->input('login')),
                Limit::perMinute(30)->by($request->ip()),
            ];
        });

        // Mecanismo de invitación (reemplaza el registro público, limiter
        // 'register' eliminado junto con AuthController::register()): por
        // IP sola, mismo criterio que 'register' tenía -- evita que un mismo
        // origen agote invitaciones ajenas por fuerza bruta del token (40
        // caracteres, espacio enorme, pero igual se acota el volumen de
        // intentos/minuto como defensa en profundidad, mismo espíritu que
        // password-recovery). 5/min es un criterio propio de este lote, no
        // confirmado con negocio.
        RateLimiter::for('invitation-accept', function (Request $request) {
            return Limit::perMinute(5)->by($request->ip());
        });

        // Solicitud de invitación (tarea 2 del mecanismo de invitación,
        // reemplaza el registro público): mismo criterio que
        // 'invitation-accept' -- por IP sola, 5/min, evita que un mismo
        // origen agote el endpoint público con solicitudes de spam/enumeración
        // masiva. Criterio propio de este lote, no confirmado con negocio.
        RateLimiter::for('invitation-request', function (Request $request) {
            return Limit::perMinute(5)->by($request->ip());
        });

        // CU-009 (recuperación de contraseña por autoservicio): mismo
        // patrón dual que 'login' -- los 3 endpoints (forgot/verify-code/
        // reset) comparten este único limiter a propósito, tratados como un
        // solo presupuesto de intentos por IP+correo (son pasos de una
        // misma operación). Limit #1 (5/min por IP+email) es la defensa
        // real contra fuerza bruta del código OTP de 6 dígitos -- RN-032
        // equivalente aquí sin contador persistido por código (ver aviso en
        // PasswordRecoveryController). Se usa 5, no 10 como en login: no
        // existe aquí un bloqueo binario tipo RN-033 que requiera dejar
        // margen para un intento adicional de verificación, así que puede
        // ser más estricto. Limit #2 (20/min por IP sola) es el mismo techo
        // agregado que 'login' aplica contra un atacante repartiendo
        // intentos entre muchos correos distintos desde el mismo origen --
        // más bajo que el de login (30) porque este flujo no tiene el
        // volumen legítimo de un login normal.
        RateLimiter::for('password-recovery', function (Request $request) {
            return [
                Limit::perMinute(5)->by($request->ip().'|'.$request->input('email')),
                Limit::perMinute(20)->by($request->ip()),
            ];
        });

        // Hallazgo Medio (especialista-seguridad, 2026-07-14): `POST
        // /admin/users/{user}/reset-password` (CU-006.9) dispara un correo
        // real (OTP) al usuario OBJETIVO sin ningún límite de tasa -- un
        // admin malicioso o con sesión comprometida podía spamear el buzón
        // del usuario objetivo, o "grief-ear" (invalidar) un reset de
        // autoservicio legítimo en curso reemplazando repetidamente el
        // código OTP vigente. Clave por actor+objetivo (no solo por IP,
        // como `login`/`password-recovery`): el actor ya está autenticado,
        // así que lo relevante es acotar cuántos resets puede disparar UN
        // admin contra UN mismo usuario objetivo por minuto, no el volumen
        // agregado de la IP. `$request->route('user')` puede devolver el
        // id crudo del parámetro de ruta o el modelo `User` ya resuelto
        // según el orden de la pipeline de middleware -- se normaliza a su
        // clave primaria en ambos casos para que la clave del limiter sea
        // estable. 5/min es un criterio propio de este lote, mismo orden de
        // magnitud que `password-recovery`, no confirmado con negocio.
        RateLimiter::for('admin-password-reset', function (Request $request) {
            $targetUser = $request->route('user');
            $targetUserId = $targetUser instanceof User ? $targetUser->getKey() : $targetUser;

            return Limit::perMinute(5)->by($request->user()?->id.'|'.$targetUserId);
        });

        // Hallazgo Media (especialista-seguridad, Módulo Residuos,
        // 2026-07-16): `POST /admin/files` no tenía ningún límite de tasa --
        // más allá del tope de CANTIDAD por categoría/entidad ya impuesto por
        // FileController, un actor autenticado podía spamear cargas sin techo
        // agregado por minuto. Por usuario (ya pasó auth:sanctum, no hace
        // falta IP): 30/min es un criterio propio de este lote, alto para no
        // afectar ráfagas legítimas (ej. las 5 fotos del wizard casi
        // simultáneas), no confirmado con negocio.
        RateLimiter::for('files-upload', function (Request $request) {
            return Limit::perMinute(30)->by($request->user()?->id ?? $request->ip());
        });

        // Mismo hallazgo, `POST /admin/wastes/{waste}/treatment-approvals` --
        // evita que un actor spamee solicitudes de evaluación a volumen alto,
        // en profundidad junto al 422 de duplicado (ver
        // WasteTreatmentApprovalController::storeForWaste()). 10/min por
        // usuario, criterio propio de este lote.
        RateLimiter::for('treatment-approval-request', function (Request $request) {
            return Limit::perMinute(10)->by($request->user()?->id ?? $request->ip());
        });
    }
}
