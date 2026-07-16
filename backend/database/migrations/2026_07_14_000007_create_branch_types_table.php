<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd: branch_types (catálogo nuevo, plan aprobado del hilo
// principal previo a construir `branches` -- ver
// database/seeders/BranchTypeSeeder.php para el detalle de los 8 valores y
// el aviso sobre la interpretación de los flags de capacidad).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('branch_types', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->string('code')->unique();
            $table->string('name')->unique();
            $table->string('category');
            $table->boolean('is_logistics')->default(false);
            $table->boolean('is_storage')->default(false);
            $table->boolean('is_treatment')->default(false);
            $table->boolean('is_dispatch')->default(false);
            $table->integer('sort_order')->default(1);
            $table->boolean('is_active')->default(true);
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('branch_types');
    }
};
