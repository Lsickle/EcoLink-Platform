<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd: people. Notas de fidelidad al esquema:
// - `location_id` se omite: la remediación D-P01 (2026-07-05, esquema-bd)
//   documenta que la tabla `locations` referenciada nunca existió y quedó
//   reemplazada por la tabla polimórfica `addresses` — mantener la columna
//   reintroduciría el bug ya corregido en el repo de documentación.
// - `branch_id`, `position_id`, `photo_file_id` quedan como columnas sin FK:
//   `branches`, `positions` y `files` no entran en el alcance de este lote
//   (organizaciones/personas/auth). Se añaden constraints cuando esas
//   tablas existan.
// - `created_by`/`updated_by` -> users.id: FK añadida en
//   add_audit_foreign_keys_to_organizations_and_people_tables (users
//   todavía no existe en este punto de la cadena de migraciones).
// - `full_name` (esquema-bd: "DEFAULT generated") se probó como columna
//   GENERATED ALWAYS AS (...) STORED, pero Postgres 17 rechaza tanto
//   regexp_replace() como concat_ws() ahí (collation no determinista en
//   VARCHAR -> la marca como no-IMMUTABLE). Se resuelve a nivel de
//   aplicación en App\Models\Person (evento `saving`) en vez de forzar
//   una columna generada frágil a nivel de BD.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('people', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('tenant_organization_id')->nullable()->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('organization_id')->nullable()->constrained('organizations')->restrictOnDelete();
            $table->unsignedBigInteger('branch_id')->nullable(); // FK -> branches.id, pendiente (branches fuera de alcance)
            $table->unsignedBigInteger('position_id')->nullable(); // FK -> positions.id, pendiente (positions fuera de alcance)
            $table->string('document_type', 20)->default('CC');
            $table->string('document_number', 50)->unique();
            $table->string('first_name', 100);
            $table->string('middle_name', 100)->nullable();
            $table->string('last_name', 100);
            $table->string('second_last_name', 100)->nullable();
            $table->string('full_name')->nullable(); // mantenida por App\Models\Person::booted()
            $table->date('birth_date')->nullable();
            $table->string('gender', 20)->nullable();
            $table->string('email')->nullable()->unique();
            $table->string('phone', 50)->nullable();
            $table->string('address')->nullable();
            $table->unsignedBigInteger('photo_file_id')->nullable(); // FK -> files.id, pendiente (files fuera de alcance)
            $table->boolean('is_active')->default(true);
            $table->jsonb('metadata')->nullable()->default(DB::raw("'{}'::jsonb"));
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->unsignedBigInteger('updated_by')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('people');
    }
};
