<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Cierra la referencia circular workflows <-> workflow_versions -- ver
// docblock de create_workflows_table. Sin ON DELETE explícito en el DDL del
// skill; se usa SET NULL (borrar la versión "actual" no debe borrar el
// workflow, mismo criterio que el resto de columnas "puntero a la fila
// vigente" del proyecto, p. ej. organizations.logo_file_id).
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('workflows', function (Blueprint $table) {
            $table->foreign('current_version_id')->references('id')->on('workflow_versions')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('workflows', function (Blueprint $table) {
            $table->dropForeign(['current_version_id']);
        });
    }
};
