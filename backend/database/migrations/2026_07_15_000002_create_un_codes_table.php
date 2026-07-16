<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd: un_codes (catálogo NUEVO de Códigos ONU de transporte de
// mercancías peligrosas). Catálogo GLOBAL (tenant_organization_id NULL)
// editable por ADMINISTRADOR, independiente de waste_streams -- sin FK ni
// relación 1:1 entre ambos en este lote (ver create_waste_streams_table).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('un_codes', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('tenant_organization_id')->nullable()->constrained('organizations')->cascadeOnDelete();
            $table->string('code')->unique();
            $table->string('name', 255);
            $table->string('hazard_class')->nullable();
            $table->string('packing_group')->nullable();
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
        Schema::dropIfExists('un_codes');
    }
};
