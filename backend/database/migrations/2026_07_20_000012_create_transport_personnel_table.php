<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (hallazgo #7, "Conductor como extensión 1:1 de people"):
// transport_personnel -- prerequisito real del módulo Programación
// Logística (D-PRG-01/03), nunca construido hasta esta tarea pese a estar
// REFERENCIADO desde `manifest_loads.transport_personnel_id`/
// `manifest_unloads.transport_personnel_id` (ambos huérfanos hasta ahora).
//
// `person_id` FK `people.id` UNIQUE -- 1:1, mismo patrón exacto que
// `users.person_id` (esquema-bd): cero duplicación de datos personales, una
// persona que es contacto/usuario y además conductor sigue siendo un único
// registro en `people`. `cascadeOnDelete` -- mismo criterio que
// `users.person_id -> people.id ON DELETE CASCADE` en esquema-bd.
//
// `organization_id` (RN-090/091, "organización transportadora asociada"):
// SIN `tenant_organization_id` -- mismo criterio EXACTO ya documentado en
// `create_vehicles_table` (Vehicle es la entidad más análoga: un recurso de
// flota propiedad de una organización) -- el aislamiento real usa
// `organization_id`, no se deja una columna huérfana que nada lee/escribe.
// Sin restricción de business_role para asociar personal de transporte a
// una organización a nivel de ESTE esquema (D-PRG-04 exige que el Generador
// adquiera `can_transport_waste=true` para operar en Modalidad 2, pero esa
// es una regla de APLICACIÓN al asignar el conductor a un
// `transport_schedule`, no un CHECK de esta tabla -- mismo criterio ya
// usado para `wastes.waste_category_id`/reglas EXISTS de Residuos, D-R01).
//
// `license_category` VARCHAR libre (no catálogo FK): sin evidencia en
// esquema-bd de un catálogo `license_categories` ya confirmado -- categorías
// reales colombianas (A1/A2/B1/B2/B3/C1/C2/C3) quedan como texto libre
// hasta que exista wireframe/decisión que exija normalizarlo (mismo
// criterio que `vehicles.operational_status`).
//
// `has_hazmat_permit` BOOLEAN (no catálogo): mismo criterio de nomenclatura
// que `vehicles.supports_hazmat` -- CU-030.3 "Validar Permisos Especiales
// Requeridos" es, hoy, una validación binaria (el conductor tiene o no el
// permiso), sin evidencia de un catálogo de tipos de permiso.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('transport_personnel', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('organization_id')->constrained('organizations')->restrictOnDelete();
            $table->foreignId('person_id')->unique()->constrained('people')->cascadeOnDelete();
            $table->string('license_number', 100)->nullable();
            $table->string('license_category', 20)->nullable();
            $table->date('license_expiration_date')->nullable();
            $table->boolean('has_hazmat_permit')->default(false);
            $table->boolean('is_active')->default(true);
            $table->jsonb('metadata')->nullable()->default(DB::raw("'{}'::jsonb"));
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transport_personnel');
    }
};
