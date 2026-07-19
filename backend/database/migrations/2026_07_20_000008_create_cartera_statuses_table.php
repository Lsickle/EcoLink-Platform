<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd (D-S04, catálogo de lookup para organization_cartera_statuses):
// cartera_statuses -- catálogo de "Estados de Cartera" (relación bilateral
// Generador<->Gestor, D-S04/D-S12). NO está listada explícitamente entre
// las migraciones pedidas por esta tarea, pero es un prerequisito real e
// ineludible: `organization_cartera_statuses` (sí pedida explícitamente)
// necesita un `cartera_status_id` FK hacia un catálogo real -- sin esta
// tabla, esa migración no es ejecutable. Se declara aquí, señalado
// explícitamente como inferencia, no como decisión ya escrita en un D-S.
//
// Seed real CONFIRMADO EN VIVO contra Figma ("Gestión de Estados de
// Cartera", breadcrumb "Configuración › Workflows › Cartera › Estados" --
// ver `07-especialista-ux.md` §3): 6 valores --
// AL_DIA/POR_VENCER/VENCIDA/EN_COBRO/JURIDICO/CASTIGADA. La columna
// `blocks_new_requests` (D-S04) coincide 1:1 con la columna "Bloq. Sol."
// (Bloquea Solicitudes) de ese frame.
//
// NO se agregan las demás columnas observadas en el mismo frame (Tipo
// Riesgo, Perm. Op., Bloq. Cert.) -- son observaciones de UI, no una
// decisión de esquema formalizada en ningún D-S de este módulo. Se deja
// como gap explícito para una futura vuelta de `arquitecto-datos`, no se
// inventa aquí (ver resumen de la tarea).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cartera_statuses', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->string('code', 50)->unique();
            $table->string('name', 150);
            $table->text('description')->nullable();
            $table->boolean('blocks_new_requests')->default(false);
            $table->boolean('is_system')->default(true);
            $table->boolean('is_active')->default(true);
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cartera_statuses');
    }
};
