<?php

use App\Models\User;
use App\Models\UserStatus;

// Hallazgo Alto (especialista-seguridad, 2026-07-13): User::hasPermission()
// nunca revisaba el estado del propio actor -- una cuenta desactivada o
// bloqueada con una sesión ya iniciada seguía pasando todas las Policies.
// EnsureUserIsActive corre en TODO el grupo `auth:sanctum` -- se prueba
// contra /api/user (ya existente, AuthController::me()) para no depender de
// endpoints Admin/*.

beforeEach(function () {
    UserStatus::query()->firstOrCreate(['code' => 'ACTIVE'], ['name' => 'Activo', 'is_system' => true, 'is_active' => true]);
    UserStatus::query()->firstOrCreate(['code' => 'INACTIVE'], ['name' => 'Inactivo', 'is_system' => true, 'is_active' => true]);
    UserStatus::query()->firstOrCreate(['code' => 'LOCKED'], ['name' => 'Bloqueado', 'is_system' => true, 'is_active' => true]);
});

test('una cuenta ACTIVE y sin locked_until pasa el middleware normalmente', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->getJson('/api/user')->assertOk();
});

test('una cuenta con user_status_id distinto de ACTIVE recibe 403 aunque la sesión ya esté iniciada', function () {
    $inactive = UserStatus::query()->where('code', 'INACTIVE')->firstOrFail();
    $user = User::factory()->create(['user_status_id' => $inactive->id, 'is_active' => false]);

    $this->actingAs($user)->getJson('/api/user')->assertForbidden();
});

test('una cuenta con locked_until no nulo recibe 403 aunque el status siga siendo ACTIVE', function () {
    $user = User::factory()->create(['locked_until' => now()]);

    $this->actingAs($user)->getJson('/api/user')->assertForbidden();
});

test('el middleware no rompe requests sin usuario autenticado (rutas públicas)', function () {
    $this->postJson('/api/login', ['login' => 'no-existe', 'password' => 'x'])->assertUnprocessable();
});
