<?php

use App\Models\PasswordHistory;
use App\Models\SecurityLog;
use App\Models\User;
use App\Models\UserStatus;
use Illuminate\Auth\Events\OtherDeviceLogout;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\PersonalAccessToken;

beforeEach(function () {
    UserStatus::query()->create(['code' => 'ACTIVE', 'name' => 'Activo', 'is_system' => true, 'is_active' => true]);
});

function registrationPayload(array $overrides = []): array
{
    return array_merge([
        'first_name' => 'Ana',
        'last_name' => 'Gomez',
        'document_type' => 'CC',
        'document_number' => '1234567890',
        'username' => 'ana.gomez',
        'email' => 'ana.gomez@example.com',
        'password' => 'Passw0rd123',
        'password_confirmation' => 'Passw0rd123',
    ], $overrides);
}

test('register creates a person and a user with ACTIVE status', function () {
    $response = $this->postJson('/api/register', registrationPayload());

    $response->assertCreated()
        ->assertJsonPath('user.username', 'ana.gomez')
        ->assertJsonMissingPath('user.password_hash');

    $user = User::query()->where('username', 'ana.gomez')->firstOrFail();

    expect($user->person)->not->toBeNull()
        ->and($user->person->full_name)->toBe('Ana Gomez')
        ->and($user->status->code)->toBe('ACTIVE')
        ->and(PasswordHistory::query()->where('user_id', $user->id)->count())->toBe(1);
});

test('register rejects duplicate username or email', function () {
    $this->postJson('/api/register', registrationPayload())->assertCreated();

    $this->postJson('/api/register', registrationPayload(['document_number' => '999999']))
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['username', 'email']);
});

test('register rejects a password that fails complexity rules', function () {
    $this->postJson('/api/register', registrationPayload([
        'password' => 'weak',
        'password_confirmation' => 'weak',
    ]))->assertUnprocessable()->assertJsonValidationErrors('password');
});

test('mobile login (device_name) returns a bearer token that authenticates requests', function () {
    $this->postJson('/api/register', registrationPayload())->assertCreated();

    $login = $this->postJson('/api/login', [
        'login' => 'ana.gomez',
        'password' => 'Passw0rd123',
        'device_name' => 'iphone-de-ana',
    ])->assertOk();

    $token = $login->json('token');
    expect($token)->not->toBeEmpty();

    $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/user')
        ->assertOk()
        ->assertJsonPath('user.username', 'ana.gomez');
});

test('web login (sin device_name) autentica por sesión', function () {
    $this->postJson('/api/register', registrationPayload())->assertCreated();

    // EnsureFrontendRequestsAreStateful solo activa la sesión si detecta un
    // Referer/Origin que esté en SANCTUM_STATEFUL_DOMAINS (localhost:3000,
    // el puerto de Next.js).
    $this->withHeaders(['Referer' => 'http://localhost:3000'])
        ->postJson('/api/login', [
            'login' => 'ana.gomez',
            'password' => 'Passw0rd123',
        ])->assertOk();

    $this->assertAuthenticated();
});

test('login con password incorrecta incrementa failed_login_attempts y bloquea tras el umbral', function () {
    $this->postJson('/api/register', registrationPayload())->assertCreated();

    foreach (range(1, 5) as $attempt) {
        $this->postJson('/api/login', ['login' => 'ana.gomez', 'password' => 'incorrecta'])
            ->assertUnprocessable();
    }

    $user = User::query()->where('username', 'ana.gomez')->firstOrFail();
    expect($user->failed_login_attempts)->toBe(5)
        ->and($user->locked_until)->not->toBeNull();

    // Aunque la contraseña ahora sea correcta, la cuenta sigue bloqueada.
    $this->postJson('/api/login', ['login' => 'ana.gomez', 'password' => 'Passw0rd123'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('login');
});

test('RN-033: una cuenta bloqueada NO se desbloquea sola sin importar el tiempo transcurrido', function () {
    $this->postJson('/api/register', registrationPayload())->assertCreated();

    foreach (range(1, 5) as $attempt) {
        $this->postJson('/api/login', ['login' => 'ana.gomez', 'password' => 'incorrecta'])
            ->assertUnprocessable();
    }

    // RN-033: "Los usuarios bloqueados solo podrán ser habilitados por
    // personal autorizado" -- sin mecanismo de expiración por tiempo. Se
    // viaja mucho más allá de la vieja ventana de 15 minutos para probar
    // que no existe ningún auto-desbloqueo.
    $this->travel(30)->days();

    $this->postJson('/api/login', ['login' => 'ana.gomez', 'password' => 'Passw0rd123'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('login');

    $this->travelBack();
});

test('RN-035: login exitoso registra un security_log LOGIN_SUCCESS', function () {
    $this->postJson('/api/register', registrationPayload())->assertCreated();

    $this->postJson('/api/login', [
        'login' => 'ana.gomez',
        'password' => 'Passw0rd123',
        'device_name' => 'test-device',
    ])->assertOk();

    $user = User::query()->where('username', 'ana.gomez')->firstOrFail();

    $log = SecurityLog::query()->where('event_type', 'LOGIN_SUCCESS')->first();
    expect($log)->not->toBeNull()
        ->and($log->result)->toBe('SUCCESS')
        ->and($log->user_id)->toBe($user->id);
});

test('RN-035: login fallido por credenciales inválidas registra un security_log sin exponer la contraseña', function () {
    $this->postJson('/api/register', registrationPayload())->assertCreated();

    $this->postJson('/api/login', ['login' => 'ana.gomez', 'password' => 'incorrecta'])
        ->assertUnprocessable();

    $log = SecurityLog::query()->where('event_type', 'LOGIN_FAILED')->first();
    expect($log)->not->toBeNull()
        ->and($log->result)->toBe('FAILURE')
        ->and($log->description)->not->toContain('incorrecta')
        ->and(json_encode($log->toArray()))->not->toContain('incorrecta');
});

test('RN-035: login con usuario inexistente registra un security_log sin user_id', function () {
    $this->postJson('/api/login', ['login' => 'no-existe', 'password' => 'lo-que-sea'])
        ->assertUnprocessable();

    $log = SecurityLog::query()->where('event_type', 'LOGIN_FAILED')->first();
    expect($log)->not->toBeNull()
        ->and($log->user_id)->toBeNull();
});

test('RN-035: login contra cuenta bloqueada registra un security_log', function () {
    $this->postJson('/api/register', registrationPayload())->assertCreated();

    foreach (range(1, 5) as $attempt) {
        $this->postJson('/api/login', ['login' => 'ana.gomez', 'password' => 'incorrecta'])
            ->assertUnprocessable();
    }

    $countBefore = SecurityLog::query()->count();

    $this->postJson('/api/login', ['login' => 'ana.gomez', 'password' => 'Passw0rd123'])
        ->assertUnprocessable();

    expect(SecurityLog::query()->count())->toBe($countBefore + 1);

    $log = SecurityLog::query()->latest('id')->first();
    expect($log->event_type)->toBe('LOGIN_FAILED')
        ->and($log->result)->toBe('FAILURE')
        ->and($log->description)->toContain('bloqueada');
});

test('RN-035: login contra cuenta inactiva registra un security_log', function () {
    UserStatus::query()->create(['code' => 'INACTIVE', 'name' => 'Inactivo', 'is_system' => true, 'is_active' => true]);

    $this->postJson('/api/register', registrationPayload())->assertCreated();

    $user = User::query()->where('username', 'ana.gomez')->firstOrFail();
    $inactive = UserStatus::query()->where('code', 'INACTIVE')->firstOrFail();
    $user->forceFill(['user_status_id' => $inactive->id])->save();

    $this->postJson('/api/login', ['login' => 'ana.gomez', 'password' => 'Passw0rd123'])
        ->assertUnprocessable();

    $log = SecurityLog::query()->where('event_type', 'LOGIN_FAILED')->first();
    expect($log)->not->toBeNull()
        ->and($log->description)->toContain('inactiva');
});

test('RN-181: el login móvil crea el token bearer con expiración (hallazgo Alta, no queda vigente para siempre)', function () {
    $this->postJson('/api/register', registrationPayload())->assertCreated();

    $this->postJson('/api/login', [
        'login' => 'ana.gomez',
        'password' => 'Passw0rd123',
        'device_name' => 'test-device',
    ])->assertOk();

    $token = PersonalAccessToken::query()->latest('id')->firstOrFail();

    expect($token->expires_at)->not->toBeNull()
        ->and($token->expires_at->isFuture())->toBeTrue()
        // 14 días exactos menos un margen de segundos por el tiempo real
        // que tarda en correr el request/assert. `diffInSeconds()` con
        // $absolute=true (segundo argumento) es intencional: sin él, esta
        // llamada devuelve un valor CON SIGNO (positivo o negativo según el
        // orden de los operandos), y un diff negativo grande también
        // cumpliría `toBeLessThan(5)` sin que el valor esté realmente cerca
        // de 0 -- un falso positivo detectado al corregir este hallazgo.
        ->and($token->expires_at->diffInSeconds(now()->addDays(14), true))->toBeLessThan(5);
});

test('logout revoca el token bearer usado', function () {
    $this->postJson('/api/register', registrationPayload())->assertCreated();

    $token = $this->postJson('/api/login', [
        'login' => 'ana.gomez',
        'password' => 'Passw0rd123',
        'device_name' => 'test-device',
    ])->json('token');

    expect(PersonalAccessToken::query()->count())->toBe(1);

    $this->withHeader('Authorization', "Bearer {$token}")
        ->postJson('/api/logout')
        ->assertOk();

    // Se verifica a nivel de BD en vez de con una segunda llamada HTTP: el
    // guard de Sanctum memoiza el usuario resuelto por request dentro del
    // mismo proceso de test, así que una getJson() posterior no siempre
    // reflejaría la revocación aunque el token ya esté borrado.
    expect(PersonalAccessToken::query()->count())->toBe(0);
});

test('logout registra un security_log LOGOUT', function () {
    $this->postJson('/api/register', registrationPayload())->assertCreated();

    $token = $this->postJson('/api/login', [
        'login' => 'ana.gomez',
        'password' => 'Passw0rd123',
        'device_name' => 'test-device',
    ])->json('token');

    $this->withHeader('Authorization', "Bearer {$token}")
        ->postJson('/api/logout')
        ->assertOk();

    $user = User::query()->where('username', 'ana.gomez')->firstOrFail();

    $log = SecurityLog::query()->where('event_type', 'LOGOUT')->first();
    expect($log)->not->toBeNull()
        ->and($log->user_id)->toBe($user->id);
});

test('cambio de password rechaza reutilizar una contraseña reciente (RN-039)', function () {
    $this->postJson('/api/register', registrationPayload())->assertCreated();

    $token = $this->postJson('/api/login', [
        'login' => 'ana.gomez',
        'password' => 'Passw0rd123',
        'device_name' => 'test-device',
    ])->json('token');

    $header = ['Authorization' => "Bearer {$token}"];

    $this->withHeaders($header)->putJson('/api/password', [
        'current_password' => 'Passw0rd123',
        'password' => 'NuevaClave123',
        'password_confirmation' => 'NuevaClave123',
    ])->assertOk();

    $this->withHeaders($header)->putJson('/api/password', [
        'current_password' => 'NuevaClave123',
        'password' => 'NuevaClave123',
        'password_confirmation' => 'NuevaClave123',
    ])->assertUnprocessable()->assertJsonValidationErrors('password');
});

test('cambio de password exitoso registra un security_log PASSWORD_CHANGED', function () {
    $this->postJson('/api/register', registrationPayload())->assertCreated();

    $token = $this->postJson('/api/login', [
        'login' => 'ana.gomez',
        'password' => 'Passw0rd123',
        'device_name' => 'test-device',
    ])->json('token');

    $this->withHeader('Authorization', "Bearer {$token}")->putJson('/api/password', [
        'current_password' => 'Passw0rd123',
        'password' => 'NuevaClave123',
        'password_confirmation' => 'NuevaClave123',
    ])->assertOk();

    $user = User::query()->where('username', 'ana.gomez')->firstOrFail();

    $log = SecurityLog::query()->where('event_type', 'PASSWORD_CHANGED')->first();
    expect($log)->not->toBeNull()
        ->and($log->user_id)->toBe($user->id)
        ->and(json_encode($log->toArray()))->not->toContain('NuevaClave123');
});

test('cambio de password revoca los demás tokens bearer pero conserva el usado en la request actual (hallazgo Media-Alta)', function () {
    $this->postJson('/api/register', registrationPayload())->assertCreated();

    $tokenA = $this->postJson('/api/login', [
        'login' => 'ana.gomez',
        'password' => 'Passw0rd123',
        'device_name' => 'device-a',
    ])->json('token');

    $tokenB = $this->postJson('/api/login', [
        'login' => 'ana.gomez',
        'password' => 'Passw0rd123',
        'device_name' => 'device-b',
    ])->json('token');

    expect(PersonalAccessToken::query()->count())->toBe(2);

    $this->withHeader('Authorization', "Bearer {$tokenA}")->putJson('/api/password', [
        'current_password' => 'Passw0rd123',
        'password' => 'NuevaClave123',
        'password_confirmation' => 'NuevaClave123',
    ])->assertOk();

    // El token B (otro dispositivo) queda revocado -- un token borrado de
    // `personal_access_tokens` nunca vuelve a autenticar ninguna request
    // futura (proceso/petición aparte, no comparte guard). Se verifica a
    // nivel de BD en vez de con una segunda llamada HTTP por el mismo
    // motivo documentado en "logout revoca el token bearer usado" más
    // arriba: el guard de Sanctum memoiza el usuario resuelto por request
    // dentro del mismo proceso de test, así que una getJson() posterior con
    // tokenB no reflejaría de forma confiable la revocación.
    $remaining = PersonalAccessToken::query()->get();
    expect($remaining)->toHaveCount(1)
        ->and($remaining->first()->name)->toBe('device-a');
});

test('cambio de password (web) dispara OtherDeviceLogout sobre el guard web -- revoca las demás sesiones (hallazgo Media-Alta)', function () {
    // AVISO -- por qué este test verifica el evento OtherDeviceLogout en vez
    // de simular dos sesiones (A y B) con cookies y hacer una segunda
    // llamada HTTP para comprobar que B queda rechazada: se intentó ese
    // enfoque primero y resultó estructuralmente NO confiable en Pest, por
    // una razón más profunda que el problema de memoización de guard/usuario
    // ya documentado para tokens en "logout revoca el token bearer usado".
    // `Illuminate\Session\Store::loadSession()` hace
    // `$this->attributes = array_replace($this->attributes, $this->readFromHandler())`
    // -- un MERGE, no un reemplazo -- sobre el store de sesión, que es un
    // singleton del contenedor reutilizado entre llamadas ->postJson()/
    // ->getJson() dentro del MISMO test. Eso hace que datos de sesión de una
    // llamada anterior (p. ej. el login_web_* de la sesión A) se filtren
    // hacia una request posterior aunque se le mande una cookie de sesión
    // distinta -- confirmado empíricamente: una segunda request con la
    // cookie de la sesión B, tras el cambio de password, seguía
    // autenticando como si nada hubiera pasado, y el `session_id` resuelto
    // ni siquiera coincidía con la cookie enviada. `Auth::forgetGuards()`
    // no alcanza a arreglar esto porque el problema está en el Store, no en
    // el guard.
    //
    // En cambio, `Illuminate\Auth\SessionGuard::logoutOtherDevices()`
    // dispara `Illuminate\Auth\Events\OtherDeviceLogout` de forma
    // incondicional (si hay usuario en el guard 'web') como parte de su
    // propio código -- es la única señal, sin ambigüedad de mecánica de
    // sesión de por medio, de que `revokeOtherWebSessions()` realmente llamó
    // a `Auth::guard('web')->logoutOtherDevices()` con el password correcto
    // (una llamada con password incorrecto habría lanzado antes de disparar
    // el evento).
    $this->postJson('/api/register', registrationPayload())->assertCreated();

    Event::fake([OtherDeviceLogout::class]);

    // EnsureFrontendRequestsAreStateful solo activa la sesión con un
    // Referer/Origin dentro de SANCTUM_STATEFUL_DOMAINS (mismo patrón que el
    // test "web login (sin device_name) autentica por sesión").
    $webHeaders = ['Referer' => 'http://localhost:3000'];

    $this->withHeaders($webHeaders)->postJson('/api/login', [
        'login' => 'ana.gomez',
        'password' => 'Passw0rd123',
    ])->assertOk();

    $user = User::query()->where('username', 'ana.gomez')->firstOrFail();

    $this->withHeaders($webHeaders)->putJson('/api/password', [
        'current_password' => 'Passw0rd123',
        'password' => 'NuevaClave123',
        'password_confirmation' => 'NuevaClave123',
    ])->assertOk();

    Event::assertDispatched(
        OtherDeviceLogout::class,
        fn (OtherDeviceLogout $event): bool => $event->guard === 'web' && $event->user->is($user),
    );
});

test('cambio de password vía token bearer (móvil) NO dispara OtherDeviceLogout -- no hay sesión web que revocar', function () {
    // Complementa el test anterior: revokeOtherWebSessions() documenta que
    // es un no-op seguro para requests autenticados por token Bearer (sin
    // sesión web activa). Sin este test, ese branch tampoco tenía cobertura.
    $this->postJson('/api/register', registrationPayload())->assertCreated();

    Event::fake([OtherDeviceLogout::class]);

    $token = $this->postJson('/api/login', [
        'login' => 'ana.gomez',
        'password' => 'Passw0rd123',
        'device_name' => 'test-device',
    ])->json('token');

    $this->withHeader('Authorization', "Bearer {$token}")->putJson('/api/password', [
        'current_password' => 'Passw0rd123',
        'password' => 'NuevaClave123',
        'password_confirmation' => 'NuevaClave123',
    ])->assertOk();

    Event::assertNotDispatched(OtherDeviceLogout::class);
});
