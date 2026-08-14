<?php

namespace App\Services;

use App\Models\Branch;
use App\Models\GenerationFrequency;
use App\Models\HazardCharacteristic;
use App\Models\MeasurementUnit;
use App\Models\Organization;
use App\Models\PhysicalState;
use App\Models\UnCode;
use App\Models\User;
use App\Models\Waste;
use App\Models\WasteCategory;
use App\Models\WasteOperationalStatus;
use App\Models\WasteStream;
use App\Models\WasteType;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Carga Masiva de Residuos (CSV) -- autoservicio (Generador/Subgestor/Gestor
 * declarando sus propios residuos) o a nombre de un Generador con relación
 * ACTIVA (Subgestor/Gestor, vía `User::hasActiveGeneratorRelationshipWith()`)
 * -- confirmado por el usuario, 2026-08-11. A diferencia de
 * `GeneratorBulkImportService` (que agrupa filas por NIT porque un Generador
 * abarca N sedes), aquí **cada fila = un residuo** -- mismo patrón de
 * `fgetcsv` fila-por-fila que `WasteStreamController::import()`/
 * `UnCodeController::import()`, una `DB::transaction()` por fila.
 *
 * Mismo set de campos y defaults de aplicación que `WasteController::store()`
 * (`waste_type_id`/`measurement_unit_id`/`operational_status_id` por defecto
 * vía catálogo si se omiten) -- no se duplica lógica de negocio nueva, solo
 * se adapta la resolución de catálogos desde código (string) a id (CSV no
 * puede referenciar ids directamente).
 *
 * La ficha de seguridad ya NO se deriva aquí (2026-08-13): antes, si la fila
 * traía alguna característica de peligrosidad se forzaba `requires_sds=true`
 * en el residuo. Ese requisito pasó a ser del GESTOR, que lo marca al evaluar
 * (`waste_treatment_approvals.requires_sds`), así que el import ya no lo
 * decide. El PDF se sigue subiendo aparte desde Evidencias (`FileController`,
 * categoría `SDS`) -- un CSV no puede transportar archivos.
 */
class WasteBulkImportService
{
    private const MAX_ROWS = 10000;

    // Encabezado del CSV en español (decisión del usuario, 2026-08-13, corte
    // limpio -- el nombre en inglés usado antes ya NO se reconoce).
    private const REQUIRED_COLUMNS = ['nombre'];

    /**
     * Códigos múltiples dentro de una misma celda CSV (`hazard_characteristics_codes`/
     * `waste_stream_codes`/`un_code_codes`) van separados por `;` -- la coma
     * ya es el delimitador de columnas del CSV.
     */
    private const MULTI_VALUE_SEPARATOR = ';';

    /**
     * @return array{created: int, errors: list<array{row: int, message: string}>, wastes: list<array<string, mixed>>}
     */
    public function import(UploadedFile $file, Organization $actingOrganization, User $actor): array
    {
        [$rows, $errors] = $this->parse($file);

        $created = 0;
        $wastes = [];

        foreach ($rows as $rowEntry) {
            try {
                $waste = DB::transaction(fn () => $this->processRow($rowEntry['data'], $actingOrganization, $actor));
                $wastes[] = [
                    'id' => $waste->id,
                    'name' => $waste->name,
                    'code' => $waste->code,
                    'branch_name' => $waste->branch?->name,
                    'waste_danger' => $waste->waste_danger,
                    'waste_danger_name' => $waste->wasteDangerCharacteristic?->name,
                ];
                $created++;
            } catch (ValidationException $e) {
                $errors[] = ['row' => $rowEntry['row'], 'message' => collect($e->errors())->flatten()->first() ?? 'Error de validación.'];
            } catch (Throwable $e) {
                report($e);
                $errors[] = ['row' => $rowEntry['row'], 'message' => 'No se pudo procesar esta fila por un error interno.'];
            }
        }

        return ['created' => $created, 'errors' => $errors, 'wastes' => $wastes];
    }

    /**
     * @return array{0: list<array{row: int, data: array<string, mixed>}>, 1: list<array{row: int, message: string}>}
     */
    private function parse(UploadedFile $file): array
    {
        $handle = fopen($file->getRealPath(), 'r');
        $header = array_map(fn ($column) => trim((string) $column), fgetcsv($handle) ?: []);

        $rows = [];
        $errors = [];
        $rowNumber = 1;

        while (($row = fgetcsv($handle)) !== false) {
            $rowNumber++;

            if ($rowNumber - 1 > self::MAX_ROWS) {
                $errors[] = ['row' => $rowNumber, 'message' => 'Se alcanzó el máximo de '.self::MAX_ROWS.' filas por archivo; el resto no se procesó.'];

                break;
            }

            $data = array_combine($header, array_pad($row, count($header), null));

            $missing = array_filter(self::REQUIRED_COLUMNS, fn ($column) => trim((string) ($data[$column] ?? '')) === '');

            if ($missing !== []) {
                $errors[] = ['row' => $rowNumber, 'message' => 'Las columnas '.implode(', ', self::REQUIRED_COLUMNS).' son requeridas.'];

                continue;
            }

            $rows[] = ['row' => $rowNumber, 'data' => $data];
        }

        fclose($handle);

        return [$rows, $errors];
    }

    /**
     * @param  array<string, mixed>  $rowData
     */
    private function processRow(array $rowData, Organization $actingOrganization, User $actor): Waste
    {
        $data = $this->resolveAttributes($rowData, $actingOrganization, $actor);
        $hazardCharacteristicIds = $this->resolveCodes($rowData['codigos_caracteristicas_peligrosidad'] ?? null, HazardCharacteristic::class, 'codigos_caracteristicas_peligrosidad');

        try {
            $waste = Waste::query()->create($data);
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages([
                'codigo_residuo' => ['Ya existe un residuo con este código en la organización.'],
            ]);
        }

        $wasteStreamIds = $this->resolveWasteStreamIds($rowData['codigos_corrientes'] ?? null, $actingOrganization->id);
        $unCodeIds = $this->resolveUnCodeIds($rowData['codigos_un'] ?? null, $actingOrganization->id);

        if ($wasteStreamIds !== []) {
            $waste->wasteStreams()->sync(collect($wasteStreamIds)->mapWithKeys(fn ($id) => [$id => [
                'tenant_organization_id' => $waste->tenant_organization_id,
                'organization_id' => $waste->organization_id,
                'classification_source' => 'MANUAL',
                'classified_by' => $actor->id,
                'classified_at' => now(),
                'created_by' => $actor->id,
            ]])->all());
        }

        if ($unCodeIds !== []) {
            $waste->unCodes()->sync(collect($unCodeIds)->mapWithKeys(fn ($id) => [$id => [
                'classification_source' => 'MANUAL',
                'classified_by' => $actor->id,
                'classified_at' => now(),
                'created_by' => $actor->id,
            ]])->all());
        }

        if ($hazardCharacteristicIds !== []) {
            $waste->hazardCharacteristics()->sync(collect($hazardCharacteristicIds)->mapWithKeys(fn ($id) => [$id => ['created_by' => $actor->id]])->all());
            $waste->recalculateWasteDanger();
        }

        return $waste->fresh(['branch', 'wasteDangerCharacteristic:code,name']);
    }

    /**
     * Mismo set de campos y defaults de aplicación que
     * `WasteController::store()` -- adaptado para resolver catálogos desde
     * código (CSV) en vez de id (formulario).
     *
     * @param  array<string, mixed>  $rowData
     * @return array<string, mixed>
     */
    private function resolveAttributes(array $rowData, Organization $actingOrganization, User $actor): array
    {
        $data = [
            'organization_id' => $actingOrganization->id,
            'name' => trim((string) $rowData['nombre']),
            'code' => $this->nullableTrim($rowData['codigo_residuo'] ?? null),
            'description' => $this->nullableTrim($rowData['descripcion'] ?? null),
            'internal_reference' => $this->nullableTrim($rowData['referencia_interna'] ?? null),
            'operational_notes' => $this->nullableTrim($rowData['observaciones_operativas'] ?? null),
            'branch_id' => $this->resolveBranchId($rowData['codigo_sede'] ?? null, $actingOrganization),
            'waste_category_id' => $this->resolveCatalogId($rowData['codigo_categoria_residuo'] ?? null, WasteCategory::class, 'codigo_categoria_residuo'),
            'physical_state_id' => $this->resolveCatalogId($rowData['codigo_estado_fisico'] ?? null, PhysicalState::class, 'codigo_estado_fisico'),
            'generation_frequency_id' => $this->resolveCatalogId($rowData['codigo_frecuencia_generacion'] ?? null, GenerationFrequency::class, 'codigo_frecuencia_generacion'),
            'quantity' => $this->nullableFloat($rowData['cantidad'] ?? null, 'cantidad'),
            'average_weight' => $this->nullableFloat($rowData['peso_promedio'] ?? null, 'peso_promedio'),
            'generation_date' => $this->nullableDate($rowData['fecha_generacion'] ?? null),
            // `requiere_transporte_especial` / `requiere_epp_especial` se
            // retiraron del CSV el 2026-08-13: son características especiales
            // que ahora marca el GESTOR al evaluar, no el Generador al
            // declarar. Dejarlas aquí habría sido una puerta trasera al mismo
            // dato que se quitó del wizard (ver WasteController::validationRules()).
            'measurement_unit_id' => $this->resolveCatalogId($rowData['codigo_unidad_medida'] ?? null, MeasurementUnit::class, 'codigo_unidad_medida')
                ?? $this->defaultCatalogId(MeasurementUnit::class, 'KG'),
            'waste_type_id' => $this->defaultCatalogId(WasteType::class, 'OPERATIONAL'),
            'operational_status_id' => $this->defaultCatalogId(WasteOperationalStatus::class, 'ACTIVE'),
            'is_active' => true,
            'created_by' => $actor->id,
            'updated_by' => $actor->id,
        ];

        // Mismo comportamiento que `WasteController::store()`: los campos
        // opcionales AUSENTES en el CSV no se pasan como `null` explícito a
        // `create()` (violaría columnas booleanas NOT NULL con default de
        // esquema, ej. `requires_special_transport`) -- se omiten para que
        // el default de la BD aplique, igual que `sometimes` en la
        // validación del formulario manual.
        return array_filter($data, fn ($value) => $value !== null);
    }

    private function resolveBranchId(mixed $branchCode, Organization $actingOrganization): ?int
    {
        $code = $this->nullableTrim($branchCode);

        if ($code === null) {
            return null;
        }

        $branchId = Branch::query()->where('organization_id', $actingOrganization->id)->where('code', $code)->value('id');

        if ($branchId === null) {
            throw ValidationException::withMessages([
                'codigo_sede' => ["No existe una sede con código '{$code}' en esta organización."],
            ]);
        }

        return $branchId;
    }

    /**
     * @param  class-string<\Illuminate\Database\Eloquent\Model>  $modelClass
     */
    private function resolveCatalogId(mixed $rawCode, string $modelClass, string $field): ?int
    {
        $code = $this->nullableTrim($rawCode);

        if ($code === null) {
            return null;
        }

        $id = $modelClass::query()->where('code', $code)->value('id');

        if ($id === null) {
            throw ValidationException::withMessages([
                $field => ["'{$code}' no es un valor válido para {$field}."],
            ]);
        }

        return $id;
    }

    /**
     * @param  class-string<\Illuminate\Database\Eloquent\Model>  $modelClass
     * @return list<int>
     */
    private function resolveCodes(mixed $rawValue, string $modelClass, string $field): array
    {
        $codes = $this->splitMultiValue($rawValue);

        if ($codes === []) {
            return [];
        }

        $found = $modelClass::query()->whereIn('code', $codes)->pluck('id', 'code');
        $missing = array_diff($codes, $found->keys()->all());

        if ($missing !== []) {
            throw ValidationException::withMessages([
                $field => ['Códigos no reconocidos: '.implode(', ', $missing).'.'],
            ]);
        }

        return $found->values()->all();
    }

    /**
     * Mismo hallazgo de seguridad ya corregido en `WasteController`
     * (`assertWasteStreamsAccessibleBy()`): `exists` en un `Rule` NO verifica
     * accesibilidad, solo existencia -- las corrientes Y/A admiten registros
     * privados por tenant.
     *
     * Hallazgo Medio (especialista-seguridad, 2026-08-12): la accesibilidad
     * se evalúa contra `$actingOrganizationId` (la organización DUEÑA del
     * residuo -- el Generador cuando se declara "a nombre de"), NUNCA contra
     * el actor real. `WasteStream::isAccessibleBy(User $actor)` no sirve
     * aquí -- ese método asume actor y dueño del residuo son la MISMA
     * organización (cierto en todo el resto del sistema, donde nunca se
     * declara a nombre de un tercero), así que se evalúa inline en vez de
     * reutilizarlo. Sin este cambio, un Subgestor podría etiquetar el
     * residuo de un Generador con una corriente PRIVADA del Subgestor -- el
     * Generador vería esa clasificación (es dueño del residuo) aunque nunca
     * tendría acceso al catálogo si lo consultara directamente, una fuga de
     * metadata de catálogo privado hacia una organización sin visibilidad
     * sobre él.
     *
     * @return list<int>
     */
    private function resolveWasteStreamIds(mixed $rawValue, int $actingOrganizationId): array
    {
        $ids = $this->resolveCodes($rawValue, WasteStream::class, 'codigos_corrientes');

        if ($ids === []) {
            return [];
        }

        $accessibleCount = WasteStream::query()->whereKey($ids)
            ->where(fn ($query) => $query->whereNull('tenant_organization_id')->orWhere('tenant_organization_id', $actingOrganizationId))
            ->count();

        if ($accessibleCount !== count($ids)) {
            throw ValidationException::withMessages([
                'codigos_corrientes' => ['Una o más corrientes indicadas no son accesibles para esta organización.'],
            ]);
        }

        return $ids;
    }

    /**
     * Mismo criterio que `resolveWasteStreamIds()` de arriba -- accesibilidad
     * evaluada contra `$actingOrganizationId`, no contra el actor real.
     *
     * @return list<int>
     */
    private function resolveUnCodeIds(mixed $rawValue, int $actingOrganizationId): array
    {
        $ids = $this->resolveCodes($rawValue, UnCode::class, 'codigos_un');

        if ($ids === []) {
            return [];
        }

        $accessibleCount = UnCode::query()->whereKey($ids)
            ->where(fn ($query) => $query->whereNull('tenant_organization_id')->orWhere('tenant_organization_id', $actingOrganizationId))
            ->count();

        if ($accessibleCount !== count($ids)) {
            throw ValidationException::withMessages([
                'codigos_un' => ['Uno o más códigos UN indicados no son accesibles para esta organización.'],
            ]);
        }

        return $ids;
    }

    /**
     * @return list<string>
     */
    private function splitMultiValue(mixed $rawValue): array
    {
        $trimmed = trim((string) ($rawValue ?? ''));

        if ($trimmed === '') {
            return [];
        }

        return collect(explode(self::MULTI_VALUE_SEPARATOR, $trimmed))
            ->map(fn ($value) => trim($value))
            ->filter(fn ($value) => $value !== '')
            ->unique()
            ->values()
            ->all();
    }

    /**
     * @param  class-string<\Illuminate\Database\Eloquent\Model>  $modelClass
     */
    private function defaultCatalogId(string $modelClass, string $code): int
    {
        $id = $modelClass::query()->where('code', $code)->value('id');

        if ($id === null) {
            throw new \LogicException("Catálogo {$modelClass} sin el valor por defecto '{$code}' sembrado.");
        }

        return $id;
    }

    private function nullableTrim(mixed $value): ?string
    {
        $trimmed = trim((string) ($value ?? ''));

        return $trimmed === '' ? null : $trimmed;
    }

    private function nullableFloat(mixed $value, string $field): ?float
    {
        $trimmed = $this->nullableTrim($value);

        if ($trimmed === null) {
            return null;
        }

        if (! is_numeric($trimmed) || (float) $trimmed < 0) {
            throw ValidationException::withMessages([
                $field => ["{$field} debe ser un número mayor o igual a 0."],
            ]);
        }

        return (float) $trimmed;
    }

    private function nullableDate(mixed $value): ?string
    {
        $trimmed = $this->nullableTrim($value);

        if ($trimmed === null) {
            return null;
        }

        if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $trimmed) || strtotime($trimmed) === false) {
            throw ValidationException::withMessages([
                'fecha_generacion' => ['fecha_generacion debe tener formato AAAA-MM-DD.'],
            ]);
        }

        return $trimmed;
    }

    private function nullableBoolean(mixed $value): ?bool
    {
        $trimmed = $this->nullableTrim($value);

        if ($trimmed === null) {
            return null;
        }

        return in_array(strtolower($trimmed), ['1', 'true', 'si', 'sí', 'yes'], true);
    }
}
