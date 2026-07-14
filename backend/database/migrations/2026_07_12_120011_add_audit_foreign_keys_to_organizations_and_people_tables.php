<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Cierra la referencia circular organizations/people <-> users: ambas
// tablas se crean antes que `users` (users depende de organizations y
// people), así que sus columnas created_by/updated_by -> users.id no
// pudieron llevar la constraint en su migración de creación. esquema-bd
// no documenta ON DELETE explícito para estas dos columnas de auditoría
// en organizations/people; se sigue el patrón dominante del resto del
// esquema (created_by=RESTRICT, updated_by=SET NULL), igual que
// positions (D-U05, módulo Usuarios y Seguridad).
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('organizations', function (Blueprint $table) {
            $table->foreign('created_by')->references('id')->on('users')->restrictOnDelete();
            $table->foreign('updated_by')->references('id')->on('users')->nullOnDelete();
        });

        Schema::table('people', function (Blueprint $table) {
            $table->foreign('created_by')->references('id')->on('users')->restrictOnDelete();
            $table->foreign('updated_by')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('organizations', function (Blueprint $table) {
            $table->dropForeign(['created_by']);
            $table->dropForeign(['updated_by']);
        });

        Schema::table('people', function (Blueprint $table) {
            $table->dropForeign(['created_by']);
            $table->dropForeign(['updated_by']);
        });
    }
};
