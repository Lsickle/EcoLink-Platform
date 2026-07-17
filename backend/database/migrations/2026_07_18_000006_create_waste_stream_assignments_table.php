<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd, punto 14: waste_stream_assignments -- pivote N:M residuo<->
// corriente Y/A (reinterpretada, no renombrada -- "corrientes Y/A, todas
// RESPEL por definición del catálogo"). Gestionada por reemplazo completo
// (sync), mismo patrón que `branch_treatment_allowed_waste_streams`, pero
// CON historial (`classification_source`/`classified_at`/`classified_by`) --
// ver WasteController::syncWasteStreams().
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('waste_stream_assignments', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('tenant_organization_id')->nullable()->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('waste_id')->constrained('wastes')->cascadeOnDelete();
            $table->foreignId('waste_stream_id')->constrained('waste_streams')->cascadeOnDelete();
            $table->boolean('is_primary')->default(false);
            $table->string('classification_source', 30)->default('MANUAL');
            $table->timestampTz('classified_at')->nullable()->useCurrent();
            $table->foreignId('classified_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();

            $table->unique(['waste_id', 'waste_stream_id'], 'waste_stream_assignments_waste_stream_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('waste_stream_assignments');
    }
};
