<?php

use App\Models\SecurityLog;
use App\Models\User;

// RN-033 (hallazgo Alta, especialista-seguridad 2026-07-13): el desbloqueo
// manual es un comando Artisan (acceso de shell/servidor), no un endpoint
// HTTP -- ver app/Console/Commands/UnlockUserCommand.php.

test('user:unlock desbloquea una cuenta bloqueada por username y registra el evento', function () {
    $user = User::factory()->create([
        'username' => 'bloqueada',
        'failed_login_attempts' => 5,
        'locked_until' => now(),
    ]);

    $this->artisan('user:unlock', ['login' => 'bloqueada', '--force' => true])
        ->expectsOutputToContain('desbloqueado')
        ->assertExitCode(0);

    $user->refresh();
    expect($user->locked_until)->toBeNull()
        ->and($user->failed_login_attempts)->toBe(0);

    $log = SecurityLog::query()->where('event_type', 'ACCOUNT_UNLOCKED_MANUAL')->first();
    expect($log)->not->toBeNull()
        ->and($log->user_id)->toBe($user->id)
        ->and($log->result)->toBe('SUCCESS')
        // Hallazgo Media/Baja (especialista-seguridad, 2026-07-13, segunda
        // pasada): sin un actor autenticado de la app (es una acción de
        // consola), se captura el usuario de sistema operativo como mejor
        // esfuerzo y se agrega a la descripción -- no hay columna de actor
        // en security_logs para este caso, ver esquema-bd.
        ->and($log->description)->toContain('Ejecutado por (SO)');
});

test('user:unlock también acepta el email como login', function () {
    $user = User::factory()->create([
        'email' => 'porcorreo@example.com',
        'locked_until' => now(),
    ]);

    $this->artisan('user:unlock', ['login' => 'porcorreo@example.com', '--force' => true])
        ->assertExitCode(0);

    expect($user->refresh()->locked_until)->toBeNull();
});

test('user:unlock pide confirmación y no desbloquea si el usuario responde que no', function () {
    $user = User::factory()->create([
        'username' => 'bloqueada.sinconfirmar',
        'failed_login_attempts' => 5,
        'locked_until' => now(),
    ]);

    $this->artisan('user:unlock', ['login' => 'bloqueada.sinconfirmar'])
        ->expectsConfirmation("¿Confirmas desbloquear la cuenta de {$user->username}?", 'no')
        ->assertExitCode(1);

    expect($user->refresh()->locked_until)->not->toBeNull();
    expect(SecurityLog::query()->where('event_type', 'ACCOUNT_UNLOCKED_MANUAL')->exists())->toBeFalse();
});

test('user:unlock desbloquea si el usuario confirma interactivamente (sin --force)', function () {
    $user = User::factory()->create([
        'username' => 'bloqueada.confirmada',
        'failed_login_attempts' => 5,
        'locked_until' => now(),
    ]);

    $this->artisan('user:unlock', ['login' => 'bloqueada.confirmada'])
        ->expectsConfirmation("¿Confirmas desbloquear la cuenta de {$user->username}?", 'yes')
        ->assertExitCode(0);

    expect($user->refresh()->locked_until)->toBeNull();
    expect(SecurityLog::query()->where('event_type', 'ACCOUNT_UNLOCKED_MANUAL')->exists())->toBeTrue();
});

test('user:unlock informa claramente si el usuario no existe (sin fallar en silencio)', function () {
    $this->artisan('user:unlock', ['login' => 'no-existe'])
        ->expectsOutputToContain('No se encontró')
        ->assertExitCode(1);

    expect(SecurityLog::query()->where('event_type', 'ACCOUNT_UNLOCKED_MANUAL')->exists())->toBeFalse();
});

test('user:unlock informa claramente si el usuario no estaba bloqueado', function () {
    User::factory()->create([
        'username' => 'no.bloqueado',
        'locked_until' => null,
    ]);

    $this->artisan('user:unlock', ['login' => 'no.bloqueado'])
        ->expectsOutputToContain('no está bloqueado')
        ->assertExitCode(0);

    expect(SecurityLog::query()->where('event_type', 'ACCOUNT_UNLOCKED_MANUAL')->exists())->toBeFalse();
});
