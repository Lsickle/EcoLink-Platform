<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd, punto 14: waste_un_codes -- pivote N:M residuo<->código UN,
// espejo estructural de `waste_stream_assignments`. `un_code_id` con
// ON DELETE RESTRICT (catálogo global, no debe borrarse físicamente si un
// residuo lo referencia) -- mismo criterio que `branch_treatment_id` en
// `waste_treatment_approvals`.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('waste_un_codes', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('waste_id')->constrained('wastes')->cascadeOnDelete();
            $table->foreignId('un_code_id')->constrained('un_codes')->restrictOnDelete();
            $table->boolean('is_primary')->default(false);
            $table->string('classification_source', 30)->default('MANUAL');
            $table->timestampTz('classified_at')->nullable()->useCurrent();
            $table->foreignId('classified_by')->nullable()->constrained('users')->nullOnDelete();
            $table->date('valid_from')->nullable();
            $table->date('valid_until')->nullable();
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();

            $table->unique(['waste_id', 'un_code_id'], 'waste_un_codes_waste_un_code_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('waste_un_codes');
    }
};
