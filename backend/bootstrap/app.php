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

        // Hallazgo Alto (especialista-seguridad, 2026-07-13): alias para el
        // grupo `auth:sanctum` de routes/api.php -- ver EnsureUserIsActive.
        $middleware->alias(['active' => EnsureUserIsActive::class]);

        // Backend API pura -- no existe ninguna ruta 'login' con nombre (routes/web.php
        // solo tiene la vista welcome). Sin esto, Laravel intenta route('login') por
        // defecto cuando una petición no autenticada llega sin Accept:application/json
        // (ej. navegación de navegador plana a un endpoint protegido), y como esa ruta
        // no existe, crashea con RouteNotFoundException en vez de devolver un 401 limpio.
        $middleware->redirectGuestsTo(fn () => null);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*'),
        );
    })->create();
