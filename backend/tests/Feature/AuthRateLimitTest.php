<?php

use App\Models\UserStatus;

beforeEach(function () {
    UserStatus::query()->create(['code' => 'ACTIVE', 'name' => 'Activo', 'is_system' => true, 'is_active' => true]);
});

// Hallazgo CRÍTICO (especialista-seguridad, 2026-07-13): /api/login y
// /api/register no tenían ningún límite de tasa -- ver
// App\Providers\AppServiceProvider::configureRateLimiting().

test('el rate limiter de login (10/min por IP+login) responde 429 al superarse', function () {
    foreach (range(1, 10) as $attempt) {
        $this->postJson('/api/login', ['login' => 'nunca-existe', 'password' => 'incorrecta'])
            ->assertStatus(422);
    }

    $this->postJson('/api/login', ['login' => 'nunca-existe', 'password' => 'incorrecta'])
        ->assertStatus(429);
});

test('el rate limiter de login sigue permitiendo un `login` distinto tras agotar el balde de otro', function () {
    foreach (range(1, 10) as $attempt) {
        $this->postJson('/api/login', ['login' => 'usuario-a', 'password' => 'incorrecta'])
            ->assertStatus(422);
    }
    $this->postJson('/api/login', ['login' => 'usuario-a', 'password' => 'incorrecta'])
        ->assertStatus(429);

    // Mismo IP, `login` distinto -> balde independiente (clave IP+login).
    $this->postJson('/api/login', ['login' => 'usuario-b', 'password' => 'incorrecta'])
        ->assertStatus(422);
});

test('el rate limiter de login agrega un techo por IP sola: password spraying contra cuentas distintas también dispara 429', function () {
    // Hallazgo Alta (especialista-seguridad, 2026-07-13, segunda pasada): el
    // límite por IP+login (10/min) protege UNA cuenta, pero no evita que un
    // atacante desde la misma IP reparta sus intentos entre cuentas
    // distintas -- cada balde IP+login individual nunca llega a 10. Se usan
    // 30 logins DISTINTOS (un intento cada uno) para no tocar el límite por
    // login individual y aislar el techo agregado por IP sola.
    foreach (range(1, 30) as $i) {
        $this->postJson('/api/login', ['login' => "spray-{$i}", 'password' => 'incorrecta'])
            ->assertStatus(422);
    }

    $this->postJson('/api/login', ['login' => 'spray-31', 'password' => 'incorrecta'])
        ->assertStatus(429);
});

test('el rate limiter de register (5/min por IP) responde 429 al superarse', function () {
    foreach (range(1, 5) as $i) {
        $this->postJson('/api/register', [
            'first_name' => 'Ana',
            'last_name' => 'Gomez',
            'document_type' => 'CC',
            'document_number' => "100000000{$i}",
            'username' => "ana.gomez.{$i}",
            'email' => "ana.gomez.{$i}@example.com",
            'password' => 'Passw0rd123',
            'password_confirmation' => 'Passw0rd123',
        ])->assertCreated();
    }

    $this->postJson('/api/register', [
        'first_name' => 'Ana',
        'last_name' => 'Gomez',
        'document_type' => 'CC',
        'document_number' => '9999999999',
        'username' => 'ana.gomez.extra',
        'email' => 'ana.gomez.extra@example.com',
        'password' => 'Passw0rd123',
        'password_confirmation' => 'Passw0rd123',
    ])->assertStatus(429);
});
