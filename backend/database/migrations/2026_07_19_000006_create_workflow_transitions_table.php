<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (item 17/D-WF-01): `workflow_transitions` -- por CÓDIGO
// (`from_status_code`/`to_status_code`), no por ID, para evitar una FK
// polimórfica hacia la fila correcta de `respel_statuses` según
// organización (mismo catálogo de códigos, ver docblock de
// create_respel_statuses_table).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workflow_transitions', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('workflow_version_id')->constrained('workflow_versions')->cascadeOnDelete();
            $table->string('from_status_code', 50);
            $table->string('to_status_code', 50);
            $table->boolean('is_automatic')->default(false);
            $table->boolean('requires_approval')->default(false);
            $table->timestampTz('created_at')->useCurrent();

            $table->unique(['workflow_version_id', 'from_status_code', 'to_status_code']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workflow_transitions');
    }
};
