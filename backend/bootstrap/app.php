<?php

use App\Http\Middleware\EnsureUserIsActive;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // 👈 AGREGA ESTA LÍNEA AQUÍ
        // Le indica a Laravel que confíe en los headers X-Forwarded-Proto de Render/Vercel
        $middleware->trustProxies(at: '*');
        // RN-181: autenticación Sanctum con cookie de sesión para el SPA
        // web (stateful, dominios en config/sanctum.php + SANCTUM_STATEFUL_DOMAINS).
        $middleware->statefulApi();

        $middleware->validateCsrfTokens(except: [
            'api/login',
        ]);
        $middleware->web(append: [
            function ($request, $next) {
                $response = $next($request);

                foreach ($response->headers->getCookies() as $cookie) {
                    if (in_array($cookie->getName(), ['ecolink-session', 'XSRF-TOKEN'])) {
                        $newCookie = new Cookie(
                            $cookie->getName(),
                            $cookie->getValue(),
                            $cookie->getExpiresTime(),
                            $cookie->getPath(),
                            $cookie->getDomain(),
                            true,  // secure
                            $cookie->isHttpOnly(),
                            false, // raw
                            'none' // sameSite
                        );

                        $response->headers->setCookie($newCookie);
                    }
                }

                return $response;
            },
        ]);
        // Hallazgo Alto (especialista-seguridad, 2026-07-13): alias para el
        // grupo `auth:sanctum` de routes/api.php -- ver EnsureUserIsActive.
        $middleware->alias(['active' => EnsureUserIsActive::class]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*'),
        );
    })->create();
