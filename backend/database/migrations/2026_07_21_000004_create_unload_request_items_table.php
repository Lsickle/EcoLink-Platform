<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (unload_request_items, D-PRG-02) -- Fase 4. Detalle de
// residuos de una `unload_request`. `manifest_load_item_id` NULL-able
// (mismo patrón D-PRG-05 ya aplicado en `manifest_unload_items`): NULL
// cuando la solicitud es "anticipada"/autotransporte sin manifiesto de
// cargue. `unit_of_measure` VARCHAR (NO FK a `measurement_units`) -- mismo
// criterio EXACTO documentado para `manifest_load_items` en esquema-bd, se
// sigue la columna tal como está especificada para ESTA tabla en concreto.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('unload_request_items', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('tenant_organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('unload_request_id')->constrained('unload_requests')->cascadeOnDelete();
            $table->foreignId('manifest_load_item_id')->nullable()->constrained('manifest_load_items')->nullOnDelete();
            $table->foreignId('waste_id')->constrained('wastes')->restrictOnDelete();
            $table->decimal('requested_quantity', 18, 3)->default(0);
            $table->string('unit_of_measure', 20)->default('KG');
            $table->string('packaging_type', 100)->nullable();
            $table->integer('line_number')->default(1);
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
        Schema::dropIfExists('unload_request_items');
    }
};
