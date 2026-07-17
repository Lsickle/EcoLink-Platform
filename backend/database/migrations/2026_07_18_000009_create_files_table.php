<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd: files -- repositorio documental TRANSVERSAL (primer consumidor
// real: evidencias de Residuos -- fotos/SDS/documentos adicionales del Paso 4
// del wizard de declaración, ver FileController). `entity_type`/`entity_id`
// son polimórficos "manuales" (no un morphTo de Eloquent): `entity_type`
// guarda un código de dominio (`WASTE`, ...) resuelto por
// `File::resolveEntity()` vía `File::ENTITY_MODELS`, no el FQCN de un modelo
// -- mismo criterio que `audit_logs.entity_name`/`custom_field_values.entity_type`
// en esquema-bd.
//
// Omitidas a propósito (mandato explícito del hilo principal, no hallazgo de
// `esquema-bd`): `ocr_processed`/`ocr_text`/`ai_tags` -- sin caso de uso real
// todavía en este lote, no se inventa funcionalidad de IA no pedida. Si un
// consumidor futuro las necesita, se agregan en una migración `ALTER TABLE`
// aparte cuando haya un caso de uso concreto.
//
// `stored_filename` se genera SIEMPRE server-side (UUID + extensión real del
// contenido) -- NUNCA el nombre original del cliente, para prevenir path
// traversal/colisiones (ver FileController::store()). `original_filename` se
// preserva solo como metadato, nunca se usa para construir `storage_path`.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('files', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->foreignId('tenant_organization_id')->nullable()->constrained('organizations')->cascadeOnDelete();
            $table->string('entity_type', 100);
            $table->unsignedBigInteger('entity_id');
            $table->string('file_category', 50)->default('GENERAL');
            $table->string('original_filename', 500);
            $table->string('stored_filename', 500)->unique();
            $table->string('file_extension', 20);
            $table->string('mime_type', 150);
            $table->unsignedBigInteger('file_size_bytes')->default(0);
            $table->string('file_hash_sha256', 128)->nullable()->unique();
            $table->string('storage_provider', 50)->default('local');
            $table->string('bucket_name', 255)->nullable();
            $table->text('storage_path')->unique();
            $table->text('public_url')->nullable();
            $table->string('visibility_level', 30)->default('INTERNAL');
            $table->integer('version_number')->default(1);
            $table->foreignId('parent_file_id')->nullable()->constrained('files')->nullOnDelete();
            $table->timestampTz('expires_at')->nullable();
            $table->text('description')->nullable();
            $table->foreignId('uploaded_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('uploaded_at')->useCurrent();
            $table->boolean('is_active')->default(true);
            $table->jsonb('metadata')->nullable()->default(DB::raw("'{}'::jsonb"));
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->timestampTz('deleted_at')->nullable();

            // Consulta de acceso más frecuente (límites por categoría +
            // listado de evidencias de una entidad, ver
            // FileController/WasteController::files()).
            $table->index(['entity_type', 'entity_id', 'file_category']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('files');
    }
};
