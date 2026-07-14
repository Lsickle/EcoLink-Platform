<?php

use App\Models\PasswordHistory;
use App\Models\SecurityLog;
use App\Models\User;
use App\Notifications\PasswordRecoveryCodeNotification;
use App\Notifications\PasswordResetConfirmationNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

// CU-009 (recorte MVP): forgot -> verify-code -> reset. RN-031 (complejidad),
// RN-033 (bloqueo/desbloqueo), RN-039 (no reutilización), RN-181
// (anti-enumeración, mismo criterio que login).

/**
 * Crea un usuario ACTIVE con contraseña conocida, listo para el flujo de
 * recuperación. No reutiliza `registrationPayload()` de AuthTest.php a
 * propósito -- evita depender del orden de carga de archivos de test para
 * que una función global quede declarada.
 */
function recoverableUser(array $overrides = []): User
{
    return User::factory()->create(array_merge([
        'email' => 'recover.me@example.com',
        'password_hash' => Hash::make('Passw0rd123'),
    ], $overrides));
}

/**
 * Ejecuta /api/password/forgot con Notification::fake() y devuelve el
 * código de 6 dígitos realmente generado (capturado desde la notificación
 * despachada), en vez de asumir un valor fijo.
 *
 * Recibe el TestCase (`$this` del test que la invoca) como primer
 * argumento a propósito: dentro de una función global de este archivo NO
 * hay un `$this` bindeado a Tests\TestCase (a diferencia de los closures
 * de test/it), así que no puede llamar `postJson()` por su cuenta.
 */
function requestRecoveryCode(TestCase $test, User $user): string
{
    Notification::fake();

    $test->postJson('/api/password/forgot', ['email' => $user->email])->assertOk();

    $code = null;
    Notification::assertSentTo(
        $user,
        PasswordRecoveryCodeNotification::class,
        function (PasswordRecoveryCodeNotification $notification) use (&$code) {
            $code = (fn () => $this->code)->call($notification);

            return true;
        },
    );

    Notification::fake(); // limpia el fake para que el test que sigue pueda hacer sus propias aserciones

    return $code;
}

test('CU-009.1: solicitar código con correo existente responde genérico, crea el token y despacha la notificación', function () {
    $user = recoverableUser();

    Notification::fake();

    $this->postJson('/api/password/forgot', ['email' => $user->email])
        ->assertOk()
        ->assertJson(['message' => 'Si existe una cuenta asociada a ese correo, recibirás un código de verificación.']);

    $row = DB::table('password_reset_tokens')->where('email', $user->email)->first();
    expect($row)->not->toBeNull()
        ->and($row->token)->not->toBeEmpty();

    Notification::assertSentTo($user, PasswordRecoveryCodeNotification::class);

    $log = SecurityLog::query()->where('event_type', 'PASSWORD_RESET_REQUESTED')->first();
    expect($log)->not->toBeNull()
        ->and($log->result)->toBe('SUCCESS')
        ->and($log->user_id)->toBe($user->id);
});

test('CU-009.1/RN-181: solicitar código con correo inexistente responde el mismo mensaje genérico sin crear nada', function () {
    Notification::fake();

    $this->postJson('/api/password/forgot', ['email' => 'no-existe@example.com'])
        ->assertOk()
        ->assertJson(['message' => 'Si existe una cuenta asociada a ese correo, recibirás un código de verificación.']);

    expect(DB::table('password_reset_tokens')->where('email', 'no-existe@example.com')->exists())->toBeFalse();

    Notification::assertNothingSent();

    $log = SecurityLog::query()->where('event_type', 'PASSWORD_RESET_REQUESTED')->first();
    expect($log)->not->toBeNull()
        ->and($log->result)->toBe('FAILURE')
        ->and($log->user_id)->toBeNull()
        ->and($log->description)->toContain('no asociado');
});

test('CU-009.2: verificar código correcto dentro del TTL responde verified true', function () {
    $user = recoverableUser();
    $code = requestRecoveryCode($this, $user);

    $this->postJson('/api/password/verify-code', ['email' => $user->email, 'code' => $code])
        ->assertOk()
        ->assertJson(['verified' => true]);
});

test('CU-009.2: verificar código incorrecto responde error genérico y registra PASSWORD_RESET_CODE_INVALID', function () {
    $user = recoverableUser();
    requestRecoveryCode($this, $user);

    $this->postJson('/api/password/verify-code', ['email' => $user->email, 'code' => '000000'])
        ->assertUnprocessable();

    $log = SecurityLog::query()->where('event_type', 'PASSWORD_RESET_CODE_INVALID')->first();
    expect($log)->not->toBeNull()
        ->and($log->result)->toBe('FAILURE');
});

test('CU-009.2: verificar código expirado (más allá del TTL del OTP) responde error genérico', function () {
    // OTP_TTL_MINUTES es privado en el controller y deliberadamente NO
    // reutiliza config('auth.passwords.users.expire') (60 min, pensado para
    // los enlaces del facade Password:: que este controller no usa) --
    // hallazgo Alta de especialista-seguridad, 2026-07-13. 10 minutos aquí
    // es el mismo valor documentado en PasswordRecoveryController.
    $user = recoverableUser();
    $code = requestRecoveryCode($this, $user);

    $this->travel(11)->minutes();

    $this->postJson('/api/password/verify-code', ['email' => $user->email, 'code' => $code])
        ->assertUnprocessable();

    $this->travelBack();
});

test('CU-009.2/RN-181: verificar código con correo inexistente responde el mismo error genérico (sin revelar si el correo existe)', function () {
    $this->postJson('/api/password/verify-code', ['email' => 'no-existe@example.com', 'code' => '123456'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['code' => 'El código es inválido o ha expirado.']);

    $log = SecurityLog::query()->where('event_type', 'PASSWORD_RESET_CODE_INVALID')->first();
    expect($log)->not->toBeNull()
        ->and($log->result)->toBe('FAILURE')
        ->and($log->user_id)->toBeNull();
});

test('CU-009.4/CU-009.5: reset exitoso actualiza la contraseña, revoca sesiones/tokens y notifica', function () {
    $user = recoverableUser();
    $otherToken = $user->createToken('otro-dispositivo')->plainTextToken;
    DB::table('sessions')->insert([
        'id' => 'session-de-prueba',
        'user_id' => $user->id,
        'payload' => base64_encode('x'),
        'last_activity' => now()->timestamp,
    ]);

    $code = requestRecoveryCode($this, $user);

    Notification::fake();

    $this->postJson('/api/password/reset', [
        'email' => $user->email,
        'code' => $code,
        'password' => 'NuevaClave123',
        'password_confirmation' => 'NuevaClave123',
    ])->assertOk()->assertJson(['message' => 'Tu contraseña ha sido actualizada correctamente.']);

    $user->refresh();
    expect(Hash::check('NuevaClave123', $user->password_hash))->toBeTrue()
        ->and(PasswordHistory::query()->where('user_id', $user->id)->where('password_hash', $user->password_hash)->exists())->toBeTrue()
        ->and(DB::table('password_reset_tokens')->where('email', $user->email)->exists())->toBeFalse()
        ->and(PersonalAccessToken::query()->count())->toBe(0)
        ->and(DB::table('sessions')->where('user_id', $user->id)->exists())->toBeFalse();

    Notification::assertSentTo($user, PasswordResetConfirmationNotification::class);

    $log = SecurityLog::query()->where('event_type', 'PASSWORD_RESET_SUCCESS')->first();
    expect($log)->not->toBeNull()
        ->and($log->result)->toBe('SUCCESS')
        ->and($log->user_id)->toBe($user->id);

    expect(PersonalAccessToken::findToken($otherToken))->toBeNull();
});

test('RN-039: reset rechaza una contraseña que reutiliza una de las últimas 5', function () {
    $user = recoverableUser();
    PasswordHistory::query()->create([
        'user_id' => $user->id,
        'password_hash' => $user->password_hash,
    ]);

    $code = requestRecoveryCode($this, $user);

    $this->postJson('/api/password/reset', [
        'email' => $user->email,
        'code' => $code,
        'password' => 'Passw0rd123',
        'password_confirmation' => 'Passw0rd123',
    ])->assertUnprocessable()->assertJsonValidationErrors('password');

    // Hueco de cobertura señalado por QA: confirma que la contraseña
    // realmente NO cambió en BD (mismo patrón que el test de código
    // inválido), no solo que la request respondió 422.
    expect(Hash::check('Passw0rd123', $user->fresh()->password_hash))->toBeTrue();
});

test('RN-031: reset rechaza una contraseña que no cumple la política de complejidad', function () {
    $user = recoverableUser();
    $code = requestRecoveryCode($this, $user);

    $this->postJson('/api/password/reset', [
        'email' => $user->email,
        'code' => $code,
        'password' => 'weak',
        'password_confirmation' => 'weak',
    ])->assertUnprocessable()->assertJsonValidationErrors('password');

    expect(Hash::check('Passw0rd123', $user->fresh()->password_hash))->toBeTrue();
});

test('reset rechaza cuando password_confirmation no coincide', function () {
    $user = recoverableUser();
    $code = requestRecoveryCode($this, $user);

    $this->postJson('/api/password/reset', [
        'email' => $user->email,
        'code' => $code,
        'password' => 'NuevaClave123',
        'password_confirmation' => 'OtraClave123',
    ])->assertUnprocessable()->assertJsonValidationErrors('password');

    expect(Hash::check('Passw0rd123', $user->fresh()->password_hash))->toBeTrue();
});

test('CU-009.4: el código es de uso único -- reutilizarlo en un segundo reset falla', function () {
    $user = recoverableUser();
    $code = requestRecoveryCode($this, $user);

    $this->postJson('/api/password/reset', [
        'email' => $user->email,
        'code' => $code,
        'password' => 'NuevaClave123',
        'password_confirmation' => 'NuevaClave123',
    ])->assertOk();

    // La fila de password_reset_tokens ya fue borrada por el reset
    // anterior -- reintentar con el MISMO código (aunque originalmente
    // fuera correcto) debe fallar, no encontrar el token válido.
    $this->postJson('/api/password/reset', [
        'email' => $user->email,
        'code' => $code,
        'password' => 'OtraClave456',
        'password_confirmation' => 'OtraClave456',
    ])->assertUnprocessable();

    $user->refresh();
    expect(Hash::check('NuevaClave123', $user->password_hash))->toBeTrue()
        ->and(Hash::check('OtraClave456', $user->password_hash))->toBeFalse();
});

test('RN-033: reset exitoso sobre una cuenta bloqueada la desbloquea y registra ACCOUNT_UNLOCKED_VIA_PASSWORD_RESET', function () {
    $user = recoverableUser([
        'locked_until' => now(),
        'failed_login_attempts' => 5,
    ]);

    $code = requestRecoveryCode($this, $user);

    $this->postJson('/api/password/reset', [
        'email' => $user->email,
        'code' => $code,
        'password' => 'NuevaClave123',
        'password_confirmation' => 'NuevaClave123',
    ])->assertOk();

    $user->refresh();
    expect($user->locked_until)->toBeNull()
        ->and($user->failed_login_attempts)->toBe(0);

    $log = SecurityLog::query()->where('event_type', 'ACCOUNT_UNLOCKED_VIA_PASSWORD_RESET')->first();
    expect($log)->not->toBeNull()
        ->and($log->result)->toBe('SUCCESS')
        ->and($log->user_id)->toBe($user->id);
});

test('reset con código inválido no revela si el correo existe (error genérico, no revalida contra un "ya verificado" del cliente)', function () {
    $user = recoverableUser();
    requestRecoveryCode($this, $user);

    $this->postJson('/api/password/reset', [
        'email' => $user->email,
        'code' => '000000',
        'password' => 'NuevaClave123',
        'password_confirmation' => 'NuevaClave123',
    ])->assertUnprocessable();

    $user->refresh();
    expect(Hash::check('Passw0rd123', $user->password_hash))->toBeTrue();
});

test('rate limiting: exceder el límite de password-recovery (5/min por IP+email) devuelve 429 en forgot', function () {
    $user = recoverableUser();
    Notification::fake();

    foreach (range(1, 5) as $attempt) {
        $this->postJson('/api/password/forgot', ['email' => $user->email])->assertOk();
    }

    $this->postJson('/api/password/forgot', ['email' => $user->email])->assertStatus(429);
});

test('rate limiting: exceder el límite de password-recovery devuelve 429 en verify-code', function () {
    // El limiter es compartido por IP+email entre los 3 endpoints (por
    // diseño, ver AppServiceProvider) -- requestRecoveryCode() ya consume 1
    // de los 5 cupos del minuto vía su propia llamada a /forgot, así que
    // solo quedan 4 disponibles antes del 429.
    $user = recoverableUser();
    $code = requestRecoveryCode($this, $user);

    foreach (range(1, 4) as $attempt) {
        $this->postJson('/api/password/verify-code', ['email' => $user->email, 'code' => '111111'])
            ->assertUnprocessable();
    }

    $this->postJson('/api/password/verify-code', ['email' => $user->email, 'code' => $code])
        ->assertStatus(429);
});

test('rate limiting: exceder el límite de password-recovery devuelve 429 en reset', function () {
    // Mismo motivo que el test de verify-code: requestRecoveryCode() ya
    // gastó 1 de los 5 cupos compartidos del minuto.
    $user = recoverableUser();
    $code = requestRecoveryCode($this, $user);

    foreach (range(1, 4) as $attempt) {
        $this->postJson('/api/password/reset', [
            'email' => $user->email,
            'code' => '111111',
            'password' => 'NuevaClave123',
            'password_confirmation' => 'NuevaClave123',
        ])->assertUnprocessable();
    }

    $this->postJson('/api/password/reset', [
        'email' => $user->email,
        'code' => $code,
        'password' => 'NuevaClave123',
        'password_confirmation' => 'NuevaClave123',
    ])->assertStatus(429);
});

test('RN-032: tras OTP_MAX_ATTEMPTS (5) intentos fallidos el código queda inutilizado, incluso para el código originalmente correcto', function () {
    // Este test necesita más de las 5 requests/min que permite el limiter
    // compartido `password-recovery` (1 de /forgot + 5 intentos fallidos +
    // 1 verificación final = 7) -- se desactiva el middleware de throttle a
    // propósito para aislar el comportamiento del contador `attempts`
    // persistido (hallazgo Alta de especialista-seguridad, 2026-07-13) del
    // límite por IP+email, que ya tiene su propia cobertura arriba.
    $this->withoutMiddleware();

    $user = recoverableUser();
    $code = requestRecoveryCode($this, $user);

    foreach (range(1, 5) as $attempt) {
        $this->postJson('/api/password/verify-code', ['email' => $user->email, 'code' => '000000'])
            ->assertUnprocessable();
    }

    expect(DB::table('password_reset_tokens')->where('email', $user->email)->exists())->toBeFalse();

    // El código original (que hubiera sido válido) ya no sirve -- la fila
    // fue borrada al llegar al 5º intento fallido.
    $this->postJson('/api/password/verify-code', ['email' => $user->email, 'code' => $code])
        ->assertUnprocessable();
});
