<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Hallazgo Baja (especialista-seguridad, 2026-07-13, revisión de
// PasswordRecoveryController): higiene de datos -- purga filas expiradas
// de `password_reset_tokens` (comando nativo de Laravel). Laravel 13 no usa
// app/Console/Kernel.php; la programación vive en este archivo.
Schedule::command('auth:clear-resets')->daily();
