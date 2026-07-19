<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (item 17/D-WF-01): `workflow_versions` -- nunca se borra una
// versión, preserva qué reglas regían cada transición pasada. `status`:
// DRAFT/PUBLISHED/ARCHIVED (lista cerrada de aplicación, mismo criterio que
// `branch_treatments.operational_status`).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workflow_versions', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('workflow_id')->constrained('workflows')->cascadeOnDelete();
            $table->integer('version_number');
            $table->string('status', 20)->default('DRAFT');
            $table->timestampTz('published_at')->nullable();
            $table->foreignId('published_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('created_at')->useCurrent();

            $table->unique(['workflow_id', 'version_number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workflow_versions');
    }
};
