<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd: waste_streams (catálogo de Corrientes de Residuos Y/A --
// Convenio de Basilea / Decreto 1076 de 2015). Catálogo GLOBAL
// (tenant_organization_id NULL) editable por ADMINISTRADOR, primer módulo
// real del dominio Residuos. Alcance de este lote (plan aprobado): NO se
// agregan columnas de peligrosidad/estado físico (is_flammable,
// is_corrosive, physical_state, etc.) -- decisión ya investigada y
// confirmada, pertenecen al futuro residuo, no a la corriente. Tampoco se
// modela la relación con un_codes -- son catálogos independientes en este
// lote (ver create_un_codes_table).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('waste_streams', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('tenant_organization_id')->nullable()->constrained('organizations')->cascadeOnDelete();
            $table->string('code')->unique();
            // Desviación del plan (name VARCHAR(255)): 8 de las 179 filas
            // reales de data_waste_streams.json (nombres largos de texto
            // legal del Convenio de Basilea) exceden 255 caracteres (máx.
            // 294) -- confirmado al correr el seeder real. Se usa TEXT para
            // no truncar datos verificados del catálogo. Señalado en el
            // resumen del lote.
            $table->text('name');
            $table->text('description')->nullable();
            $table->string('tipo');
            $table->boolean('requires_manifest')->default(true);
            $table->boolean('requires_special_transport')->default(false);
            $table->boolean('is_system')->default(true);
            $table->boolean('is_active')->default(true);
            $table->jsonb('metadata')->default('{}');
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('waste_streams');
    }
};
