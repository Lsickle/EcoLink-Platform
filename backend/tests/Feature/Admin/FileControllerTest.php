<?php

use App\Models\File;
use App\Models\ManifestUnload;
use App\Models\Organization;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\UnloadRequest;
use App\Models\User;
use App\Models\UserRole;
use App\Models\Waste;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

// Subsistema TRANSVERSAL de carga de archivos (esquema-bd: `files`). Primer
// consumidor real: evidencias del Módulo Residuos (Paso 4 del wizard --
// fotos/SDS/documentos adicionales). La autorización SIEMPRE se resuelve
// contra la entidad dueña (Waste/WastePolicy) -- reutiliza
// `wastes.read`/`wastes.update`, NO existe un permiso `files.*` propio.

function fileActor(array $codes = [], ?int $tenantOrganizationId = null): User
{
    $actor = User::factory()->create(['tenant_organization_id' => $tenantOrganizationId]);

    if ($codes !== []) {
        $role = Role::factory()->create();

        foreach ($codes as $code) {
            $permission = Permission::query()->firstOrCreate(['code' => $code], [
                'name' => $code, 'module' => explode('.', $code)[0], 'action' => explode('.', $code)[1] ?? $code,
                'scope' => 'tenant', 'is_system' => true, 'is_active' => true,
            ]);
            RolePermission::query()->create(['role_id' => $role->id, 'permission_id' => $permission->id, 'is_active' => true]);
        }

        UserRole::query()->create(['user_id' => $actor->id, 'role_id' => $role->id, 'is_active' => true]);
    }

    return $actor;
}

function filePlatformStaffActor(array $codes = []): User
{
    $platform = Organization::query()->where('is_platform_tenant', true)->first()
        ?? Organization::factory()->create(['is_platform_tenant' => true]);

    return fileActor($codes, $platform->id);
}

// Contenido real (bytes mágicos `%PDF-`) para que la detección de MIME por
// CONTENIDO (fileinfo, NO por nombre/extensión del cliente) reconozca el
// tipo -- se construye con `new UploadedFile(...)` (NUNCA
// `UploadedFile::fake()->createWithContent()`, cuyo `getMimeType()` de
// prueba deriva del NOMBRE del archivo, no del contenido -- inservible para
// probar detección real). Contenido único por llamada (comentario aparte)
// para no colisionar con `files.file_hash_sha256` (UNIQUE, esquema-bd).
function fakePdf(string $name = 'sds.pdf'): UploadedFile
{
    $path = tempnam(sys_get_temp_dir(), 'pdf');
    file_put_contents($path, "%PDF-1.4\n% {$name} ".Str::random(16)."\n%%EOF");

    return new UploadedFile($path, $name, 'application/pdf', null, true);
}

// Construye un UploadedFile "crudo" (no el helper `fake()` de Laravel, que
// deriva `getMimeType()` del NOMBRE del archivo en vez del contenido real)
// para poder probar la detección de MIME por CONTENIDO real.
function rawUploadedFile(string $name, string $content, string $claimedMimeType): UploadedFile
{
    $path = tempnam(sys_get_temp_dir(), 'raw');
    file_put_contents($path, $content);

    return new UploadedFile($path, $name, $claimedMimeType, null, true);
}

beforeEach(function () {
    Storage::fake(config('filesystems.default'));
});

// ---- Validaciones de seguridad obligatorias ----

test('store rechaza un MIME no permitido para la categoría (WASTE_PHOTO exige imagen)', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $organization->id]);
    $actor = fileActor(['wastes.update'], $organization->id);

    $this->actingAs($actor)->postJson('/api/admin/files', [
        'entity_type' => 'WASTE',
        'entity_id' => $waste->id,
        'file_category' => 'WASTE_PHOTO',
        'file' => rawUploadedFile('malicioso.jpg', 'contenido-no-es-una-imagen-real', 'image/jpeg'),
    ])->assertUnprocessable()->assertJsonValidationErrors('file');

    expect(File::query()->count())->toBe(0);
});

test('store rechaza un PDF disfrazado de imagen aunque el nombre diga .jpg', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $organization->id]);
    $actor = fileActor(['wastes.update'], $organization->id);

    $pdfContentNamedAsJpg = new UploadedFile(
        tap(tempnam(sys_get_temp_dir(), 'sds'), fn ($path) => file_put_contents($path, "%PDF-1.4\n%%EOF")),
        'disfrazado.jpg',
        'image/jpeg',
        null,
        true,
    );

    $this->actingAs($actor)->postJson('/api/admin/files', [
        'entity_type' => 'WASTE',
        'entity_id' => $waste->id,
        'file_category' => 'WASTE_PHOTO',
        'file' => $pdfContentNamedAsJpg,
    ])->assertUnprocessable()->assertJsonValidationErrors('file');
});

test('store rechaza un archivo que excede el tamaño máximo permitido', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $organization->id]);
    $actor = fileActor(['wastes.update'], $organization->id);

    $this->actingAs($actor)->postJson('/api/admin/files', [
        'entity_type' => 'WASTE',
        'entity_id' => $waste->id,
        'file_category' => 'WASTE_PHOTO',
        'file' => UploadedFile::fake()->image('grande.jpg')->size(10241),
    ])->assertUnprocessable()->assertJsonValidationErrors('file');
});

test('store rechaza si el actor no tiene acceso al residuo (otro tenant)', function () {
    $ownOrganization = Organization::factory()->create();
    $otherOrganization = Organization::factory()->create();
    $foreignWaste = Waste::factory()->create(['organization_id' => $otherOrganization->id]);

    $actor = fileActor(['wastes.update'], $ownOrganization->id);

    $this->actingAs($actor)->postJson('/api/admin/files', [
        'entity_type' => 'WASTE',
        'entity_id' => $foreignWaste->id,
        'file_category' => 'WASTE_PHOTO',
        'file' => UploadedFile::fake()->image('foto.jpg'),
    ])->assertForbidden();

    expect(File::query()->count())->toBe(0);
});

test('store rechaza sin el permiso wastes.update', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $organization->id]);
    $actor = fileActor(['wastes.read'], $organization->id);

    $this->actingAs($actor)->postJson('/api/admin/files', [
        'entity_type' => 'WASTE',
        'entity_id' => $waste->id,
        'file_category' => 'WASTE_PHOTO',
        'file' => UploadedFile::fake()->image('foto.jpg'),
    ])->assertForbidden();
});

test('store devuelve 404 si la entidad indicada no existe -- sin tocar el filesystem', function () {
    $organization = Organization::factory()->create();
    $actor = fileActor(['wastes.update'], $organization->id);

    $this->actingAs($actor)->postJson('/api/admin/files', [
        'entity_type' => 'WASTE',
        'entity_id' => 999999,
        'file_category' => 'WASTE_PHOTO',
        'file' => UploadedFile::fake()->image('foto.jpg'),
    ])->assertNotFound();

    Storage::disk(config('filesystems.default'))->assertDirectoryEmpty('files');
});

test('store rechaza un entity_type/file_category no soportado', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $organization->id]);
    $actor = fileActor(['wastes.update'], $organization->id);

    $this->actingAs($actor)->postJson('/api/admin/files', [
        'entity_type' => 'WASTE',
        'entity_id' => $waste->id,
        'file_category' => 'NO_EXISTE',
        'file' => UploadedFile::fake()->image('foto.jpg'),
    ])->assertUnprocessable()->assertJsonValidationErrors('file_category');
});

// ---- Happy path + generación de stored_filename/hash ----

test('store crea el archivo con stored_filename aleatorio (no el original), hash y storage_path', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $organization->id]);
    $actor = fileActor(['wastes.update'], $organization->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/files', [
        'entity_type' => 'WASTE',
        'entity_id' => $waste->id,
        'file_category' => 'WASTE_PHOTO',
        'file' => UploadedFile::fake()->image('mi-foto-original.jpg'),
    ])->assertCreated();

    $file = File::query()->findOrFail($response->json('file.id'));

    expect($file->original_filename)->toBe('mi-foto-original.jpg')
        ->and($file->stored_filename)->not->toBe('mi-foto-original.jpg')
        ->and($file->file_hash_sha256)->not->toBeNull()
        ->and($file->storage_path)->not->toBeNull()
        ->and($file->entity_type)->toBe('WASTE')
        ->and($file->entity_id)->toBe($waste->id)
        ->and($file->is_active)->toBeTrue()
        ->and($file->uploaded_by_user_id)->toBe($actor->id);

    Storage::disk(config('filesystems.default'))->assertExists($file->storage_path);
});

// ---- Límite de 5 fotos por residuo ----

test('store rechaza una sexta foto WASTE_PHOTO con 422 legible', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $organization->id]);
    $actor = fileActor(['wastes.update'], $organization->id);

    for ($i = 0; $i < 5; $i++) {
        // Ancho distinto por iteración -- el contenido codificado de cada
        // imagen debe ser distinto para no colisionar con
        // `files.file_hash_sha256` (UNIQUE, esquema-bd).
        $this->actingAs($actor)->postJson('/api/admin/files', [
            'entity_type' => 'WASTE',
            'entity_id' => $waste->id,
            'file_category' => 'WASTE_PHOTO',
            'file' => UploadedFile::fake()->image("foto{$i}.jpg", 10 + $i, 10),
        ])->assertCreated();
    }

    $this->actingAs($actor)->postJson('/api/admin/files', [
        'entity_type' => 'WASTE',
        'entity_id' => $waste->id,
        'file_category' => 'WASTE_PHOTO',
        'file' => UploadedFile::fake()->image('sexta.jpg', 99, 10),
    ])->assertUnprocessable()->assertJsonValidationErrors('file');

    expect(File::query()->where('entity_id', $waste->id)->where('file_category', 'WASTE_PHOTO')->count())->toBe(5);
});

// ---- Límite de 20 documentos adicionales por residuo (hallazgo Media, especialista-seguridad) ----

test('store rechaza un vigésimo primer ADDITIONAL_DOCUMENT con 422 legible', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $organization->id]);
    $actor = fileActor(['wastes.update'], $organization->id);

    for ($i = 0; $i < 20; $i++) {
        $this->actingAs($actor)->postJson('/api/admin/files', [
            'entity_type' => 'WASTE',
            'entity_id' => $waste->id,
            'file_category' => 'ADDITIONAL_DOCUMENT',
            'file' => fakePdf("doc{$i}.pdf"),
        ])->assertCreated();
    }

    $this->actingAs($actor)->postJson('/api/admin/files', [
        'entity_type' => 'WASTE',
        'entity_id' => $waste->id,
        'file_category' => 'ADDITIONAL_DOCUMENT',
        'file' => fakePdf('doc-numero-21.pdf'),
    ])->assertUnprocessable()->assertJsonValidationErrors('file');

    expect(File::query()->where('entity_id', $waste->id)->where('file_category', 'ADDITIONAL_DOCUMENT')->count())->toBe(20);
});

// ---- Rate limiting de /admin/files (hallazgo Media, especialista-seguridad) ----

test('store devuelve 429 al exceder el límite de tasa de /admin/files (30/min por usuario)', function () {
    $organization = Organization::factory()->create();
    $actor = fileActor(['wastes.update'], $organization->id);

    for ($i = 0; $i < 30; $i++) {
        $waste = Waste::factory()->create(['organization_id' => $organization->id]);

        $this->actingAs($actor)->postJson('/api/admin/files', [
            'entity_type' => 'WASTE',
            'entity_id' => $waste->id,
            'file_category' => 'WASTE_PHOTO',
            'file' => UploadedFile::fake()->image("foto{$i}.jpg", 10 + $i, 10),
        ])->assertCreated();
    }

    $overflowWaste = Waste::factory()->create(['organization_id' => $organization->id]);

    $this->actingAs($actor)->postJson('/api/admin/files', [
        'entity_type' => 'WASTE',
        'entity_id' => $overflowWaste->id,
        'file_category' => 'WASTE_PHOTO',
        'file' => UploadedFile::fake()->image('foto-31.jpg', 99, 10),
    ])->assertStatus(429);
});

// ---- Reemplazo del SDS anterior ----

test('store con SDS reemplaza el anterior (queda inactivo + soft-eliminado)', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $organization->id]);
    $actor = fileActor(['wastes.update'], $organization->id);

    $firstResponse = $this->actingAs($actor)->postJson('/api/admin/files', [
        'entity_type' => 'WASTE',
        'entity_id' => $waste->id,
        'file_category' => 'SDS',
        'file' => fakePdf('sds-v1.pdf'),
    ])->assertCreated();
    $firstId = $firstResponse->json('file.id');

    $secondResponse = $this->actingAs($actor)->postJson('/api/admin/files', [
        'entity_type' => 'WASTE',
        'entity_id' => $waste->id,
        'file_category' => 'SDS',
        'file' => fakePdf('sds-v2.pdf'),
    ])->assertCreated();
    $secondId = $secondResponse->json('file.id');

    $first = File::withTrashed()->findOrFail($firstId);
    $second = File::query()->findOrFail($secondId);

    expect($first->is_active)->toBeFalse()
        ->and($first->deleted_at)->not->toBeNull()
        ->and($second->is_active)->toBeTrue();

    expect(File::query()->where('entity_id', $waste->id)->where('file_category', 'SDS')->where('is_active', true)->count())->toBe(1);
});

// ---- IDOR: aislamiento por tenant en show/download/destroy ----

test('show/download/destroy devuelven 403 para un actor de OTRO tenant (IDOR)', function () {
    $ownOrganization = Organization::factory()->create();
    $otherOrganization = Organization::factory()->create();
    $foreignWaste = Waste::factory()->create(['organization_id' => $otherOrganization->id]);
    $foreignActor = fileActor(['wastes.update'], $otherOrganization->id);

    $response = $this->actingAs($foreignActor)->postJson('/api/admin/files', [
        'entity_type' => 'WASTE',
        'entity_id' => $foreignWaste->id,
        'file_category' => 'WASTE_PHOTO',
        'file' => UploadedFile::fake()->image('ajena.jpg'),
    ])->assertCreated();
    $fileId = $response->json('file.id');

    $intruder = fileActor(['wastes.read', 'wastes.update'], $ownOrganization->id);

    $this->actingAs($intruder)->getJson("/api/admin/files/{$fileId}")->assertForbidden();
    $this->actingAs($intruder)->getJson("/api/admin/files/{$fileId}/download")->assertForbidden();
    $this->actingAs($intruder)->deleteJson("/api/admin/files/{$fileId}")->assertForbidden();

    expect(File::query()->findOrFail($fileId)->is_active)->toBeTrue();
});

test('platform staff SÍ puede ver/descargar/borrar archivos de CUALQUIER tenant', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $organization->id]);
    $actor = fileActor(['wastes.update'], $organization->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/files', [
        'entity_type' => 'WASTE',
        'entity_id' => $waste->id,
        'file_category' => 'WASTE_PHOTO',
        'file' => UploadedFile::fake()->image('foto.jpg'),
    ])->assertCreated();
    $fileId = $response->json('file.id');

    $platformActor = filePlatformStaffActor(['wastes.read', 'wastes.update']);

    $this->actingAs($platformActor)->getJson("/api/admin/files/{$fileId}")->assertOk();
    $this->actingAs($platformActor)->getJson("/api/admin/files/{$fileId}/download")->assertOk();
});

// ---- show()/download() ----

test('show devuelve la metadata del archivo, no el binario', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $organization->id]);
    $actor = fileActor(['wastes.read', 'wastes.update'], $organization->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/files', [
        'entity_type' => 'WASTE',
        'entity_id' => $waste->id,
        'file_category' => 'WASTE_PHOTO',
        'file' => UploadedFile::fake()->image('foto.jpg'),
    ])->assertCreated();
    $fileId = $response->json('file.id');

    $this->actingAs($actor)->getJson("/api/admin/files/{$fileId}")
        ->assertOk()
        ->assertJsonStructure(['file' => ['id', 'original_filename', 'stored_filename', 'file_category']]);
});

test('download sirve el binario del archivo', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $organization->id]);
    $actor = fileActor(['wastes.read', 'wastes.update'], $organization->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/files', [
        'entity_type' => 'WASTE',
        'entity_id' => $waste->id,
        'file_category' => 'WASTE_PHOTO',
        'file' => UploadedFile::fake()->image('foto.jpg'),
    ])->assertCreated();
    $fileId = $response->json('file.id');

    $this->actingAs($actor)->get("/api/admin/files/{$fileId}/download")->assertOk();
});

// ---- download() fuerza descarga, nunca renderizado inline (hallazgo Media, especialista-seguridad) ----

test('download responde con Content-Disposition attachment usando original_filename, nunca inline', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $organization->id]);
    $actor = fileActor(['wastes.read', 'wastes.update'], $organization->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/files', [
        'entity_type' => 'WASTE',
        'entity_id' => $waste->id,
        'file_category' => 'WASTE_PHOTO',
        'file' => UploadedFile::fake()->image('mi-foto-original.jpg'),
    ])->assertCreated();
    $fileId = $response->json('file.id');

    $downloadResponse = $this->actingAs($actor)->get("/api/admin/files/{$fileId}/download")->assertOk();

    $disposition = $downloadResponse->headers->get('Content-Disposition');

    expect($disposition)->toContain('attachment')
        ->and($disposition)->not->toContain('inline')
        ->and($disposition)->toContain('mi-foto-original.jpg');
});

// ---- destroy(): soft-delete anti-tampering (RN-158) ----

test('destroy hace soft-delete -- nunca borra el archivo físico ni la fila permanentemente', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $organization->id]);
    $actor = fileActor(['wastes.update'], $organization->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/files', [
        'entity_type' => 'WASTE',
        'entity_id' => $waste->id,
        'file_category' => 'ADDITIONAL_DOCUMENT',
        'file' => fakePdf('doc.pdf'),
    ])->assertCreated();
    $fileId = $response->json('file.id');
    $file = File::query()->findOrFail($fileId);
    $storagePath = $file->storage_path;

    $this->actingAs($actor)->deleteJson("/api/admin/files/{$fileId}")->assertOk();

    $trashed = File::withTrashed()->findOrFail($fileId);
    expect($trashed->deleted_at)->not->toBeNull()
        ->and($trashed->is_active)->toBeFalse();

    Storage::disk(config('filesystems.default'))->assertExists($storagePath);
    $this->actingAs($actor)->getJson("/api/admin/files/{$fileId}")->assertNotFound();
});

// ---- GET /admin/wastes/{waste}/files ----

test('WasteController::files lista solo archivos activos, agrupados por categoría', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $organization->id]);
    $actor = fileActor(['wastes.read', 'wastes.update'], $organization->id);

    $this->actingAs($actor)->postJson('/api/admin/files', [
        'entity_type' => 'WASTE', 'entity_id' => $waste->id, 'file_category' => 'WASTE_PHOTO',
        'file' => UploadedFile::fake()->image('foto1.jpg'),
    ])->assertCreated();

    $sdsResponse = $this->actingAs($actor)->postJson('/api/admin/files', [
        'entity_type' => 'WASTE', 'entity_id' => $waste->id, 'file_category' => 'SDS',
        'file' => fakePdf('sds.pdf'),
    ])->assertCreated();

    $this->actingAs($actor)->deleteJson('/api/admin/files/'.$sdsResponse->json('file.id'))->assertOk();

    $response = $this->actingAs($actor)->getJson("/api/admin/wastes/{$waste->id}/files")->assertOk();

    $files = $response->json('files');
    expect($files)->toHaveKey('WASTE_PHOTO')
        ->and($files)->not->toHaveKey('SDS');
});

test('WasteController::files exige wastes.read Y accesibilidad al residuo', function () {
    $ownOrganization = Organization::factory()->create();
    $otherOrganization = Organization::factory()->create();
    $foreignWaste = Waste::factory()->create(['organization_id' => $otherOrganization->id]);

    $actor = fileActor(['wastes.read'], $ownOrganization->id);

    $this->actingAs($actor)->getJson("/api/admin/wastes/{$foreignWaste->id}/files")->assertForbidden();
});

// ---- MANIFEST_UNLOAD: evidencias fotográficas (hallazgo Media, especialista-seguridad,
// revisión Fase 5 "Manifiesto de Descargue" -- ENTITY_FILE_CATEGORIES/CATEGORY_EXTENSIONS
// no tenían entrada para MANIFEST_UNLOAD y ManifestUnloadPolicy no exponía un método
// update(), así que Gate::authorize('update', $entity) resolvía false para CUALQUIER
// actor -- la subida fallaba cerrado para todos, contradiciendo el docblock de File.php) ----

function fuManifestUnloadFixture(): array
{
    $receiver = Organization::factory()->create();
    $carrier = Organization::factory()->create();
    $unloadRequest = UnloadRequest::factory()->create(['carrier_organization_id' => $carrier->id]);
    $manifestUnload = ManifestUnload::factory()->create([
        'receiving_organization_id' => $receiver->id,
        'unload_request_id' => $unloadRequest->id,
    ]);

    return [$manifestUnload, $receiver, $carrier];
}

test('store sube una evidencia fotográfica (PHOTO_EVIDENCE) para manifest_unloads como el receptor legítimo', function () {
    [$manifestUnload, $receiver] = fuManifestUnloadFixture();
    $actor = fileActor(['manifest_unloads.update'], $receiver->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/files', [
        'entity_type' => 'MANIFEST_UNLOAD',
        'entity_id' => $manifestUnload->id,
        'file_category' => 'PHOTO_EVIDENCE',
        'file' => UploadedFile::fake()->image('evidencia.jpg'),
    ])->assertCreated();

    $file = File::query()->findOrFail($response->json('file.id'));
    expect($file->entity_type)->toBe('MANIFEST_UNLOAD')
        ->and($file->entity_id)->toBe($manifestUnload->id)
        ->and($file->file_category)->toBe('PHOTO_EVIDENCE');
});

test('store rechaza (403) al actor transportador de manifest_unloads -- solo lee/firma, no gestiona evidencias', function () {
    [$manifestUnload, , $carrier] = fuManifestUnloadFixture();

    // Con el permiso manifest_unloads.update -- aun así rechazado, porque
    // ManifestUnloadPolicy::update() (misma lógica que manage()) exige
    // pertenecer a la organización RECEPTORA, no basta con el permiso.
    $carrierActor = fileActor(['manifest_unloads.update'], $carrier->id);

    $this->actingAs($carrierActor)->postJson('/api/admin/files', [
        'entity_type' => 'MANIFEST_UNLOAD',
        'entity_id' => $manifestUnload->id,
        'file_category' => 'PHOTO_EVIDENCE',
        'file' => UploadedFile::fake()->image('evidencia.jpg'),
    ])->assertForbidden();

    expect(File::query()->where('entity_id', $manifestUnload->id)->count())->toBe(0);
});
