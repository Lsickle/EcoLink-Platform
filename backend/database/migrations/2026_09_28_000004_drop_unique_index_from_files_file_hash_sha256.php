<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Bug real reportado en producción: subir una SDS/foto/documento adicional
// cuyo contenido (SHA-256) ya existía en CUALQUIER parte del sistema
// fallaba con 422 ("Ya existe un archivo idéntico registrado en el
// sistema."), aunque fuera para un residuo u organización distintos.
//
// Regla de negocio confirmada por el usuario: las evidencias de un residuo
// (fotos/SDS/documentos adicionales) NO son documentos únicos por
// contenido -- el mismo archivo físico puede repetirse legítimamente entre
// residuos e incluso entre generadores distintos. La aplicación solo debe
// validar tipo (mimes) y tamaño máximo (FileController::store(), sin
// tocar), nunca unicidad de contenido. `file_hash_sha256` se conserva como
// metadato (columna sin restricción), solo se retira el índice UNIQUE
// global que causaba el bloqueo.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('files', function (Blueprint $table) {
            $table->dropUnique(['file_hash_sha256']);
        });
    }

    public function down(): void
    {
        Schema::table('files', function (Blueprint $table) {
            $table->unique('file_hash_sha256');
        });
    }
};
