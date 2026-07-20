<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\FileFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd: files -- repositorio documental TRANSVERSAL. Primer consumidor
// real: evidencias del Módulo Residuos (fotos/SDS/documentos adicionales,
// Paso 4 del wizard) -- ver FileController.
//
// `entity_type`/`entity_id` son un polimórfico "manual" (no morphTo): guarda
// un código de dominio (`WASTE`) resuelto vía self::ENTITY_MODELS, no un
// FQCN -- mismo criterio que `audit_logs.entity_name`. La autorización real
// SIEMPRE vive en la entidad dueña (Policy de esa entidad), `files` es solo
// almacenamiento -- ver docblock de FileController.
//
// `stored_filename`/`storage_path` los genera SIEMPRE el servidor (nunca el
// cliente) -- ver FileController::store(). `original_filename` es solo
// metadato, nunca se usa para resolver una ruta física.
#[Fillable([
    'tenant_organization_id', 'entity_type', 'entity_id', 'file_category',
    'original_filename', 'stored_filename', 'file_extension', 'mime_type',
    'file_size_bytes', 'file_hash_sha256', 'storage_provider', 'bucket_name',
    'storage_path', 'public_url', 'visibility_level', 'version_number',
    'parent_file_id', 'expires_at', 'description', 'uploaded_by_user_id',
    'uploaded_at', 'is_active', 'metadata',
])]
class File extends Model
{
    /** @use HasFactory<FileFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    /**
     * Mapa de `entity_type` -> modelo Eloquent dueño. Único consumidor real
     * hoy: Residuos (`WASTE`). Extender aquí cuando un nuevo módulo empiece
     * a usar `files` -- NO inventar entity_type nuevos sin un consumidor real.
     *
     * @var array<string, class-string<Model>>
     */
    public const ENTITY_MODELS = [
        'WASTE' => Waste::class,
        // Módulo Manifiesto de Descargue, Fase 5: evidencias fotográficas de
        // la inspección/descargue en planta -- reutiliza este subsistema
        // transversal, sin tabla de evidencias propia (decisión #7 del
        // enunciado de esta tarea). La autorización real vía
        // `ManifestUnload::isAccessibleBy()`/`ManifestUnloadPolicy`, resuelta
        // automáticamente por `File::resolveEntity()`.
        'MANIFEST_UNLOAD' => ManifestUnload::class,
    ];

    protected function casts(): array
    {
        return [
            'file_size_bytes' => 'integer',
            'version_number' => 'integer',
            'expires_at' => 'datetime',
            'uploaded_at' => 'datetime',
            'is_active' => 'boolean',
            'metadata' => 'array',
        ];
    }

    public function parentFile(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_file_id');
    }

    public function uploadedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by_user_id');
    }

    /**
     * Resuelve la entidad dueña de este archivo (`entity_type`/`entity_id`)
     * -- NULL si `entity_type` no está soportado o la entidad no existe.
     * Usado por FileController para autorizar SIEMPRE contra la Policy real
     * de la entidad dueña, nunca una capa de autorización paralela.
     */
    public function resolveEntity(): ?Model
    {
        $modelClass = self::ENTITY_MODELS[$this->entity_type] ?? null;

        if ($modelClass === null) {
            return null;
        }

        return $modelClass::query()->find($this->entity_id);
    }
}
