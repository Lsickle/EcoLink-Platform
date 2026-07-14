<?php

namespace App\Providers;

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
     * /api/login y /api/register no tenían ningún límite de tasa, lo que
     * permitía fuerza bruta distribuida (evitando el umbral de bloqueo por
     * cuenta de RN-033 atacando muchas cuentas distintas desde el mismo
     * origen) y DoS por el costo de CPU de bcrypt (rounds=12) sin límite de
     * requests.
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

        // Por IP sola, más laxo que login: evita que un mismo origen
        // registre decenas de cuentas por minuto, sin ser tan estricto como
        // el límite de login (no hay una cuenta concreta que combinar aquí).
        RateLimiter::for('register', function (Request $request) {
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
    }
}
