<?php

use App\Models\PasswordHistory;
use App\Models\SecurityLog;
use App\Models\User;
use App\Models\UserInvitation;
use App\Models\UserStatus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;

// Mecanismo de invitación de usuarios (reemplaza el registro público
// eliminado -- CU-006.1 modificado). InvitationController::accept() es
// público, sin auth:sanctum.

beforeEach(function () {
    UserStatus::query()->firstOrCreate(['code' => 'PENDING_ACTIVATION'], ['name' => 'Pendiente de activación', 'is_system' => true, 'is_active' => true]);
    UserStatus::query()->firstOrCreate(['code' => 'ACTIVE'], ['name' => 'Activo', 'is_system' => true, 'is_active' => true]);
    Notification::fake();
});

/**
 * @return array{0: User, 1: string}
 */
function createInvitedUser(): array
{
    $pending = UserStatus::query()->where('code', 'PENDING_ACTIVATION')->firstOrFail();

    $user = User::factory()->create(['user_status_id' => $pending->id]);
    $token = UserInvitation::issueFor($user);

    return [$user, $token];
}

test('accept exitoso activa la cuenta, permite login con la nueva contraseña y marca accepted_at', function () {
    [$user, $token] = createInvitedUser();

    $this->postJson('/api/invitations/accept', [
        'token' => $token,
        'password' => 'NuevaClave123',
        'password_confirmation' => 'NuevaClave123',
    ])->assertOk();

    $user->refresh();
    expect($user->status->code)->toBe('ACTIVE')
        ->and(PasswordHistory::query()->where('user_id', $user->id)->exists())->toBeTrue();

    $row = DB::table('user_invitations')->where('user_id', $user->id)->first();
    expect($row->accepted_at)->not->toBeNull();

    // Sin login automático (mismo criterio que el register() eliminado) --
    // la contraseña nueva sí funciona en un login por separado. Se manda
    // `device_name` para tomar la rama de token Bearer (sin sesión) --
    // mismo motivo que el resto de la suite, ver AuthTest.
    $this->postJson('/api/login', [
        'login' => $user->username,
        'password' => 'NuevaClave123',
        'device_name' => 'test-device',
    ])->assertOk();

    expect(SecurityLog::query()->where('event_type', 'INVITATION_ACCEPTED')->exists())->toBeTrue();
});

test('accept con token expirado devuelve 422 genérico y no activa al usuario', function () {
    [$user, $token] = createInvitedUser();

    DB::table('user_invitations')->where('user_id', $user->id)->update(['expires_at' => now()->subDay()]);

    $this->postJson('/api/invitations/accept', [
        'token' => $token,
        'password' => 'NuevaClave123',
        'password_confirmation' => 'NuevaClave123',
    ])->assertUnprocessable()->assertJsonValidationErrors('token');

    expect($user->fresh()->status->code)->toBe('PENDING_ACTIVATION');
});

test('accept con una invitación ya aceptada devuelve 422 genérico (uso único)', function () {
    [$user, $token] = createInvitedUser();

    DB::table('user_invitations')->where('user_id', $user->id)->update(['accepted_at' => now()]);

    $this->postJson('/api/invitations/accept', [
        'token' => $token,
        'password' => 'NuevaClave123',
        'password_confirmation' => 'NuevaClave123',
    ])->assertUnprocessable()->assertJsonValidationErrors('token');
});

test('accept con token inexistente/inválido devuelve 422 genérico sin filtrar información', function () {
    createInvitedUser();

    $this->postJson('/api/invitations/accept', [
        'token' => 'este-token-no-existe-en-ninguna-parte',
        'password' => 'NuevaClave123',
        'password_confirmation' => 'NuevaClave123',
    ])->assertUnprocessable()->assertJsonValidationErrors('token');
});

test('accept rechaza si las contraseñas no coinciden', function () {
    [, $token] = createInvitedUser();

    $this->postJson('/api/invitations/accept', [
        'token' => $token,
        'password' => 'NuevaClave123',
        'password_confirmation' => 'OtraDistinta123',
    ])->assertUnprocessable()->assertJsonValidationErrors('password');
});

test('accept rechaza una contraseña que no cumple la política de complejidad', function () {
    [, $token] = createInvitedUser();

    $this->postJson('/api/invitations/accept', [
        'token' => $token,
        'password' => 'weak',
        'password_confirmation' => 'weak',
    ])->assertUnprocessable()->assertJsonValidationErrors('password');
});
