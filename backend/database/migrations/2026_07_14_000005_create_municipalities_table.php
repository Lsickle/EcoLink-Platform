<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (D-P01, geografía en cascada): municipalities. Catálogo de
// solo lectura -- sin `deleted_at`, mismo patrón que `user_statuses`.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('municipalities', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('department_id')->constrained('departments')->restrictOnDelete();
            $table->string('codigo_dane');
            $table->string('name');
            $table->boolean('is_active')->default(true);
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();

            $table->unique(['department_id', 'codigo_dane']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('municipalities');
    }
};
