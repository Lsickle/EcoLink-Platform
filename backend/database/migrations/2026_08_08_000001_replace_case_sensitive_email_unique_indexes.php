<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// RN-181: el login (y varios comandos de consola / chequeos anti-duplicado
// de invitaciones) comparaban `email` de forma sensible a mayúsculas
// (`where('email', ...)`), pese a que `PasswordRecoveryController` ya
// resolvía esto correctamente (`normalizeEmail()` +
// `whereRaw('LOWER(email) = ?', ...)`). Al generalizar ese patrón se
// confirmó que el índice único de BD tenía el mismo problema: los índices
// únicos planos `users_email_unique`/`people_email_unique` (btree sobre
// `email`) permiten hoy crear dos cuentas que solo difieran en
// mayúsculas/minúsculas -- se reemplazan por índices únicos FUNCIONALES
// `UNIQUE (LOWER(email))`, mismo patrón que
// `2026_07_15_233500_replace_branches_code_unique_with_partial_index`.
//
// Se descarta `citext` (requeriría `CREATE EXTENSION`, sin precedente en
// este repo, y duplicaría el mecanismo de normalización junto con el
// mutator `email()` de `User`/`Person`). Sin paso de limpieza de datos: 0
// duplicados verificados en este lote antes de aplicar la migración.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function ($table) {
            $table->dropUnique('users_email_unique');
        });

        DB::statement('CREATE UNIQUE INDEX users_email_unique ON users (LOWER(email))');

        Schema::table('people', function ($table) {
            $table->dropUnique('people_email_unique');
        });

        DB::statement('CREATE UNIQUE INDEX people_email_unique ON people (LOWER(email))');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS users_email_unique');

        Schema::table('users', function ($table) {
            $table->unique('email');
        });

        DB::statement('DROP INDEX IF EXISTS people_email_unique');

        Schema::table('people', function ($table) {
            $table->unique('email');
        });
    }
};
