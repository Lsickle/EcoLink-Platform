<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd, punto 14 (D-R04 revisado): waste_hazard_characteristics --
// pivote N:M residuo<->característica de peligrosidad (multi-select real).
// Gestionada por reemplazo completo (sync, sin historial por ítem) -- ver
// WasteController::syncHazardCharacteristics(), que TAMBIÉN recalcula
// `wastes.waste_danger` tras el sync (Waste::recalculateWasteDanger()).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('waste_hazard_characteristics', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('waste_id')->constrained('wastes')->cascadeOnDelete();
            $table->foreignId('hazard_characteristic_id')->constrained('hazard_characteristics')->restrictOnDelete();
            $table->timestampTz('created_at')->useCurrent();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->unique(['waste_id', 'hazard_characteristic_id'], 'waste_hazard_characteristics_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('waste_hazard_characteristics');
    }
};
