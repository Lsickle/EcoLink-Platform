<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\PasswordRecoveryController;
use Illuminate\Support\Facades\Route;

// RN-181: registro/login son públicos; el resto exige sesión Sanctum
// (cookie web o token Bearer móvil, según cómo se autenticó el cliente).
//
// Hallazgo CRÍTICO (especialista-seguridad, 2026-07-13): ambas rutas
// llevan rate limiting dedicado (ver AppServiceProvider::configureRateLimiting())
// -- sin él, quedaban abiertas a fuerza bruta distribuida y DoS por costo de
// bcrypt.
Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:register');
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:login');

// CU-009 (recorte MVP): recuperación de contraseña por autoservicio, sin
// sesión -- los 3 pasos comparten el limiter `password-recovery` a
// propósito (se tratan como un solo presupuesto de intentos por IP+correo,
// ver AppServiceProvider::configureRateLimiting()).
Route::post('/password/forgot', [PasswordRecoveryController::class, 'forgot'])->middleware('throttle:password-recovery');
Route::post('/password/verify-code', [PasswordRecoveryController::class, 'verifyCode'])->middleware('throttle:password-recovery');
Route::post('/password/reset', [PasswordRecoveryController::class, 'reset'])->middleware('throttle:password-recovery');

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'me']);
    Route::put('/password', [AuthController::class, 'changePassword']);
});
