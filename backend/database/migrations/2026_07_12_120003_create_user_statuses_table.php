<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd, módulo Usuarios y Seguridad (D-U02, 2026-07-07): tabla nueva
// -- `users.status_usuario_id` apuntaba a una tabla inexistente. Seed exacto
// dado por esquema-bd: PENDING_ACTIVATION/ACTIVE/LOCKED/SUSPENDED/INACTIVE.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_statuses', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->string('code', 50)->unique();
            $table->string('name', 100);
            $table->boolean('is_system')->default(true);
            $table->boolean('is_active')->default(true);
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_statuses');
    }
};
