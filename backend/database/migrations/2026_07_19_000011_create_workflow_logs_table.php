<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (tabla ya existente en el cuerpo del skill, sin cambios de
// estructura por D-WF-04): registro cronológico de eventos operativos del
// motor de Workflow. `process_type`/`process_id` identifican la entidad
// PRINCIPAL que transiciona; `related_entity`/`related_entity_id` una
// entidad secundaria opcional mencionada en el evento -- roles distintos,
// no redundantes (confirmado D-WF-04).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workflow_logs', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->uuid('traceability_uuid');
            $table->foreignId('tenant_organization_id')->nullable()->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
            $table->string('process_type', 50);
            $table->unsignedBigInteger('process_id')->nullable();
            $table->string('event_code', 100);
            $table->string('event_name', 255);
            $table->text('description')->nullable();
            $table->string('previous_status', 50)->nullable();
            $table->string('new_status', 50)->nullable();
            $table->string('related_entity', 100)->nullable();
            $table->unsignedBigInteger('related_entity_id')->nullable();
            $table->string('severity', 20)->default('INFO');
            $table->string('source', 50)->default('APPLICATION');
            $table->jsonb('metadata')->nullable()->default(DB::raw("'{}'::jsonb"));
            $table->uuid('correlation_id')->nullable();
            $table->timestampTz('occurred_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workflow_logs');
    }
};
