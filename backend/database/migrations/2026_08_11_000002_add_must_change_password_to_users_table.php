<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Cambio de contraseña obligatorio en el primer login (confirmado por el
// usuario, 2026-08-11) -- hallazgo Alto de la revisión de seguridad de la
// Carga Masiva de Generadores: `UserProvisioningService::createActiveAdminForOrganization()`
// crea usuarios ACTIVE con una contraseña real generada, sin ningún
// mecanismo que fuerce cambiarla -- el Subgestor/Gestor que ejecuta la
// carga retenía indefinidamente una copia válida de esa contraseña.
//
// Columna genérica (no acoplada a la Carga Masiva) a propósito: el mockup
// y el contrato de API imaginado de CU-006.9 "Reiniciar Credenciales de
// Usuario" (reinicio ADMINISTRATIVO de contraseña por un admin, NO
// construido en este lote) ya prevén un parámetro `force_change`/checkbox
// "Forzar cambio en primer inicio" -- este flag queda listo para que ese
// futuro caso de uso lo reutilice sin otra migración, sin que eso implique
// construirlo ahora.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('must_change_password')->default(false)->after('user_status_id');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('must_change_password');
        });
    }
};
