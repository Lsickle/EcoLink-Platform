<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd: branch_treatment_allowed_waste_streams (D-R02) -- resuelve
// RN-063 (compatibilidad residuo<->tratamiento vía corriente Y/A). Pivote
// N:M desde `branch_treatments` hacia `waste_streams`, gestionado como
// selección múltiple tipo checklist (sync completo, sin historial de
// auditoría por ítem individual) -- ver
// BranchTreatmentController::syncAllowedWasteStreams().
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('branch_treatment_allowed_waste_streams', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('branch_treatment_id')->constrained('branch_treatments')->cascadeOnDelete();
            $table->foreignId('waste_stream_id')->constrained('waste_streams')->restrictOnDelete();
            $table->timestampTz('created_at')->useCurrent();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->unique(['branch_treatment_id', 'waste_stream_id'], 'branch_treatment_waste_stream_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('branch_treatment_allowed_waste_streams');
    }
};
