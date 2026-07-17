<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd: branch_treatment_allowed_un_codes (D-R02) -- mismo patrón
// exacto que branch_treatment_allowed_waste_streams, eje UN en vez de Y/A.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('branch_treatment_allowed_un_codes', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('branch_treatment_id')->constrained('branch_treatments')->cascadeOnDelete();
            $table->foreignId('un_code_id')->constrained('un_codes')->restrictOnDelete();
            $table->timestampTz('created_at')->useCurrent();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->unique(['branch_treatment_id', 'un_code_id'], 'branch_treatment_un_code_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('branch_treatment_allowed_un_codes');
    }
};
