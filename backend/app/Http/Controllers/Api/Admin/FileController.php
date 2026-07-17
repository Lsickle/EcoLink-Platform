<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Concerns\LogsSecurityEvents;
use App\Http\Controllers\Controller;
use App\Models\File;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Subsistema TRANSVERSAL de carga de archivos (esquema-bd: `files`). Primer
 * consumidor real: evidencias del Módulo Residuos (Paso 4 del wizard de
 * declaración -- fotos/SDS/documentos adicionales).
 *
 * La autorización NUNCA vive en esta capa -- `files` es solo almacenamiento.
 * Cada acción resuelve la entidad dueña (`File::resolveEntity()`) y delega
 * en SU Policy real (`Gate::authorize()`), reutilizando los permisos ya
 * existentes de esa entidad (para Residuos: `wastes.read` para ver,
 * `wastes.update` para subir/borrar) -- NO se inventa un permiso `files.*`
 * paralelo.
 *
 * El binario se guarda detrás de `Storage::disk(...)` (Laravel Filesystem)
 * -- nunca se hardcodea el driver `local`, así que cambiar a S3 en
 * producción (D6, CLAUDE.md) es solo config, no código. `storage_provider`
 * persiste el disco usado al momento de la carga, para que `download()` siga
 * sirviendo correctamente aunque el disco default de la app cambie después.
 */
class FileController extends Controller
{
    use LogsSecurityEvents;

    /**
     * 10 MB por archivo -- límite razonable para fotos de residuos y fichas
     * de seguridad (PDF), sin abrir la puerta a archivos que agoten disco/
     * cuota de forma trivial. Documentado aquí como decisión propia del
     * lote (no confirmado explícitamente por el usuario) -- ajustar si el
     * negocio define un límite distinto.
     */
    private const MAX_FILE_SIZE_KB = 10240;

    /**
     * `WASTE_PHOTO` máx. 5 por residuo (RN del wizard, Paso 4, confirmado
     * en el encargo de este lote).
     */
    private const MAX_WASTE_PHOTOS = 5;

    /**
     * Hallazgo Media (especialista-seguridad, Módulo Residuos, 2026-07-16):
     * `ADDITIONAL_DOCUMENT` no tenía tope de cantidad -- un actor autenticado
     * podía subir documentos repetidamente sin límite. 20 por entidad es un
     * criterio propio de este lote (no confirmado con negocio), generoso
     * para casos legítimos (fichas técnicas, permisos, actas) sin dejar la
     * puerta abierta a agotar disco/cuota de forma trivial.
     */
    private const MAX_ADDITIONAL_DOCUMENTS = 20;

    /**
     * Límite de cantidad por `file_category` -- categorías ausentes de este
     * mapa (hoy: `SDS`, que ya tiene su propio mecanismo de reemplazo, ver
     * `replacePreviousSds()`) no tienen tope de cantidad.
     *
     * @var array<string, int>
     */
    private const CATEGORY_LIMITS = [
        'WASTE_PHOTO' => self::MAX_WASTE_PHOTOS,
        'ADDITIONAL_DOCUMENT' => self::MAX_ADDITIONAL_DOCUMENTS,
    ];

    /**
     * Categorías válidas por `entity_type` -- único consumidor real hoy:
     * Residuos. Extender cuando un módulo nuevo use `files` de verdad.
     *
     * @var array<string, list<string>>
     */
    private const ENTITY_FILE_CATEGORIES = [
        'WASTE' => ['WASTE_PHOTO', 'SDS', 'ADDITIONAL_DOCUMENT'],
    ];

    /**
     * Whitelist de extensiones permitidas por categoría -- NUNCA se confía
     * en la extensión del nombre original, la validación real ocurre sobre
     * el contenido (regla `mimes`, basada en detección real vía fileinfo,
     * no en el nombre del archivo del cliente).
     *
     * @var array<string, list<string>>
     */
    private const CATEGORY_EXTENSIONS = [
        'WASTE_PHOTO' => ['jpg', 'jpeg', 'png', 'webp'],
        'SDS' => ['pdf'],
        'ADDITIONAL_DOCUMENT' => ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
    ];

    /**
     * Mapa mime real (detectado vía fileinfo, ver `UploadedFile::getMimeType()`)
     * -> extensión canónica para nombrar el `stored_filename` -- evita
     * depender de la extensión del nombre original del cliente.
     *
     * @var array<string, string>
     */
    private const MIME_EXTENSIONS = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'application/pdf' => 'pdf',
    ];

    public function store(Request $request)
    {
        $actor = $request->user();

        $data = $request->validate([
            'entity_type' => ['required', 'string', Rule::in(array_keys(File::ENTITY_MODELS))],
            'entity_id' => ['required', 'integer', 'min:1'],
            'file_category' => ['required', 'string'],
            'description' => ['sometimes', 'nullable', 'string', 'max:1000'],
        ]);

        $allowedCategories = self::ENTITY_FILE_CATEGORIES[$data['entity_type']] ?? [];

        if (! in_array($data['file_category'], $allowedCategories, true)) {
            throw ValidationException::withMessages([
                'file_category' => ['La categoría de archivo indicada no es válida para este tipo de entidad.'],
            ]);
        }

        $extensions = self::CATEGORY_EXTENSIONS[$data['file_category']];

        Validator::make($request->all(), [
            'file' => [
                'required', 'file', 'max:'.self::MAX_FILE_SIZE_KB,
                'mimes:'.implode(',', $extensions),
            ],
        ])->validate();

        // Verifica acceso a la entidad ANTES de tocar el filesystem -- 404
        // si no existe, 403 (vía Gate) si existe pero no es accesible.
        $modelClass = File::ENTITY_MODELS[$data['entity_type']];
        $entity = $modelClass::query()->find($data['entity_id']);
        abort_if($entity === null, 404, 'La entidad indicada no existe.');

        Gate::authorize('update', $entity);

        if (array_key_exists($data['file_category'], self::CATEGORY_LIMITS)) {
            $this->assertFileCategoryLimitNotExceeded(
                $data['entity_type'], $data['entity_id'], $data['file_category'], self::CATEGORY_LIMITS[$data['file_category']],
            );
        }

        /** @var UploadedFile $uploadedFile */
        $uploadedFile = $request->file('file');

        $mimeType = $uploadedFile->getMimeType();
        $extension = self::MIME_EXTENSIONS[$mimeType] ?? strtolower($uploadedFile->extension() ?? 'bin');
        $storedFilename = Str::uuid()->toString().'.'.$extension;
        $disk = config('filesystems.default');
        $directory = 'files/'.strtolower($data['entity_type']).'/'.$data['entity_id'].'/'.$data['file_category'];

        $storagePath = Storage::disk($disk)->putFileAs($directory, $uploadedFile, $storedFilename);

        if ($storagePath === false) {
            throw ValidationException::withMessages([
                'file' => ['No se pudo almacenar el archivo. Intente nuevamente.'],
            ]);
        }

        try {
            $file = File::query()->create([
                'tenant_organization_id' => $entity->tenant_organization_id ?? null,
                'entity_type' => $data['entity_type'],
                'entity_id' => $data['entity_id'],
                'file_category' => $data['file_category'],
                'original_filename' => $uploadedFile->getClientOriginalName(),
                'stored_filename' => $storedFilename,
                'file_extension' => $extension,
                'mime_type' => $mimeType,
                'file_size_bytes' => $uploadedFile->getSize(),
                'file_hash_sha256' => hash_file('sha256', $uploadedFile->getRealPath()),
                'storage_provider' => $disk,
                'storage_path' => $storagePath,
                'visibility_level' => 'INTERNAL',
                'description' => $data['description'] ?? null,
                'uploaded_by_user_id' => $actor->id,
                'uploaded_at' => now(),
                'is_active' => true,
            ]);
        } catch (\Illuminate\Database\UniqueConstraintViolationException $exception) {
            // Evita huérfanos en disco si la fila no pudo crearse -- caso
            // real: el mismo contenido (`file_hash_sha256` UNIQUE, ver
            // esquema-bd) ya está registrado en el sistema.
            Storage::disk($disk)->delete($storagePath);

            throw ValidationException::withMessages([
                'file' => ['Ya existe un archivo idéntico registrado en el sistema.'],
            ]);
        } catch (\Throwable $exception) {
            Storage::disk($disk)->delete($storagePath);

            throw $exception;
        }

        if ($data['file_category'] === 'SDS') {
            $this->replacePreviousSds($file);
        }

        $this->logSecurityEvent(
            $request, 'FILE_UPLOADED', 'SUCCESS',
            "Archivo '{$file->original_filename}' cargado para {$data['entity_type']}#{$data['entity_id']}.", $actor,
            ['file_id' => $file->id, 'entity_type' => $data['entity_type'], 'entity_id' => $data['entity_id'], 'file_category' => $data['file_category']],
        );

        return response()->json(['file' => $file], 201);
    }

    public function show(Request $request, File $file)
    {
        $entity = $file->resolveEntity();
        abort_if($entity === null, 404, 'La entidad dueña del archivo ya no existe.');

        Gate::authorize('view', $entity);

        return response()->json(['file' => $file]);
    }

    /**
     * `visibility_level=INTERNAL` es el único valor real de este lote --
     * se trata como "requiere sesión autenticada + Policy de la entidad
     * dueña" (ya garantizado por el middleware `auth:sanctum`/`active` del
     * grupo de rutas + el `Gate::authorize()` de abajo). Sirve el binario
     * SIEMPRE vía `storage_path` ya persistido en BD -- nunca reconstruye
     * una ruta a partir de `entity_id`/nombres de usuario.
     *
     * Hallazgo Media (especialista-seguridad, 2026-07-16): `Storage::response()`
     * sirve `Content-Disposition: inline` por defecto (el navegador intenta
     * renderizar el archivo en vez de descargarlo) -- se usa `download()`
     * explícitamente para forzar `attachment`, con `original_filename` (el
     * nombre legible guardado en BD) como nombre de descarga, nunca
     * `stored_filename` (el UUID interno).
     */
    public function download(Request $request, File $file)
    {
        $entity = $file->resolveEntity();
        abort_if($entity === null, 404, 'La entidad dueña del archivo ya no existe.');

        Gate::authorize('view', $entity);

        return Storage::disk($file->storage_provider)->download($file->storage_path, $file->original_filename);
    }

    /**
     * Soft-delete únicamente -- RN-158 (anti-tampering, mismo criterio ya
     * aplicado en el resto del proyecto): nunca borra el archivo físico ni
     * la fila permanentemente.
     */
    public function destroy(Request $request, File $file)
    {
        $entity = $file->resolveEntity();
        abort_if($entity === null, 404, 'La entidad dueña del archivo ya no existe.');

        Gate::authorize('update', $entity);

        $file->forceFill(['is_active' => false])->save();
        $file->delete();

        $this->logSecurityEvent(
            $request, 'FILE_DELETED', 'SUCCESS',
            "Archivo '{$file->original_filename}' eliminado de {$file->entity_type}#{$file->entity_id}.", $request->user(),
            ['file_id' => $file->id, 'entity_type' => $file->entity_type, 'entity_id' => $file->entity_id, 'file_category' => $file->file_category],
        );

        return response()->json(['message' => 'Archivo eliminado.']);
    }

    /**
     * Genérico por categoría -- reemplaza el antiguo
     * `assertWastePhotoLimitNotReached()` (hallazgo Media,
     * especialista-seguridad: `ADDITIONAL_DOCUMENT` no tenía tope). Reutilizado
     * por cualquier categoría presente en `CATEGORY_LIMITS`.
     */
    private function assertFileCategoryLimitNotExceeded(string $entityType, int $entityId, string $category, int $limit): void
    {
        $count = File::query()
            ->where('entity_type', $entityType)
            ->where('entity_id', $entityId)
            ->where('file_category', $category)
            ->where('is_active', true)
            ->count();

        if ($count >= $limit) {
            throw ValidationException::withMessages([
                'file' => ["Este residuo ya alcanzó el máximo de {$limit} archivos de la categoría '{$category}' permitidos."],
            ]);
        }
    }

    /**
     * SDS: máx. 1 por residuo -- un nuevo SDS reemplaza al anterior (queda
     * inactivo + soft-eliminado), mismo patrón "reemplazo" ya usado en otros
     * módulos del proyecto.
     */
    private function replacePreviousSds(File $newFile): void
    {
        File::query()
            ->where('entity_type', $newFile->entity_type)
            ->where('entity_id', $newFile->entity_id)
            ->where('file_category', 'SDS')
            ->where('is_active', true)
            ->whereKeyNot($newFile->id)
            ->get()
            ->each(function (File $previous) {
                $previous->forceFill(['is_active' => false])->save();
                $previous->delete();
            });
    }
}
