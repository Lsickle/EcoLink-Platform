<?php

use App\Models\Person;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

// RN-181: el índice único de `email` en `users`/`people` era sensible a
// mayúsculas (btree plano sobre la columna) -- nada impedía crear dos
// cuentas que solo difirieran en capitalización. Se reemplaza por un índice
// único FUNCIONAL `UNIQUE (LOWER(email))` (migración
// 2026_08_08_000001_replace_case_sensitive_email_unique_indexes). Confirmado
// que `phpunit.xml` no sobreescribe `DB_CONNECTION` (queda `pgsql` de
// `.env`), así que la suite corre contra Postgres real, no sqlite
// in-memory -- este test prueba el constraint REAL de BD, no la validación
// de Laravel ni el mutator del modelo.
//
// Se inserta el segundo registro vía `DB::table()->insert()` (bypass
// deliberado de `App\Models\User`/`App\Models\Person`, que ya normalizan
// `email` a minúsculas en el mutator `email()`) -- de lo contrario el
// mutator por sí solo ya igualaría ambos valores antes de llegar a la BD, y
// el test pasaría aunque el índice siguiera siendo sensible a mayúsculas
// (falso positivo).

test('el índice único de users.email es insensible a mayúsculas a nivel de Postgres', function () {
    $existing = User::factory()->create(['email' => 'duplicado@example.com']);

    expect(fn () => DB::table('users')->insert([
        'username' => 'otro-username-mayus',
        'email' => 'DUPLICADO@EXAMPLE.COM',
        'password_hash' => 'hash-cualquiera',
        'user_status_id' => $existing->user_status_id,
    ]))->toThrow(QueryException::class);
});

test('el índice único de people.email es insensible a mayúsculas a nivel de Postgres', function () {
    Person::factory()->create(['email' => 'duplicado.persona@example.com']);

    expect(fn () => DB::table('people')->insert([
        'document_number' => 'OTRO-DOC-MAYUS-'.uniqid(),
        'first_name' => 'Otra',
        'last_name' => 'Persona',
        'email' => 'DUPLICADO.PERSONA@EXAMPLE.COM',
    ]))->toThrow(QueryException::class);
});
