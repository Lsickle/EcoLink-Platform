<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd: branches. El DDL documentado en esquema-bd (~línea 356) usa
// una FK `location_id -> locations`, tabla que la remediación D-P01 ya
// confirmó que nunca existió (reemplazada por `addresses` polimórfica). En
// vez de replicar ese bug, o de introducir `addresses` (fuera de alcance de
// este lote), esta migración usa FKs geográficas directas y opcionales
// (country_id/department_id/municipality_id/locality_id), decisión ya
// confirmada con el usuario en el plan de este lote.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('branches', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('branch_type_id')->constrained('branch_types')->restrictOnDelete();
            $table->string('code');
            $table->string('name');
            // Lista cerrada de texto, no catálogo FK (confirmado en el plan):
            // ACTIVE / INACTIVE / SUSPENDED.
            $table->string('status')->default('ACTIVE');
            $table->foreignId('country_id')->nullable()->constrained('countries')->nullOnDelete();
            $table->foreignId('department_id')->nullable()->constrained('departments')->nullOnDelete();
            $table->foreignId('municipality_id')->nullable()->constrained('municipalities')->nullOnDelete();
            $table->foreignId('locality_id')->nullable()->constrained('localities')->nullOnDelete();
            $table->text('address')->nullable();
            $table->string('phone')->nullable();
            $table->string('email')->nullable();
            // Campo genérico único (no separado por tipo de licencia): la
            // etiqueta se relabela en el frontend según el business_role de
            // la organización dueña (Reg. RESPEL si Generador, Lic.
            // Transporte si Transportador) -- no hace falta una columna por
            // tipo de licencia.
            $table->string('environmental_license')->nullable();
            $table->date('license_expiration_date')->nullable();
            $table->decimal('operational_capacity', 10, 2)->nullable();
            $table->text('observations')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();

            $table->unique(['organization_id', 'code']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('branches');
    }
};
