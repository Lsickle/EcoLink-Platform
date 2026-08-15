<?php

namespace App\Services;

use App\Http\Controllers\Api\Admin\GeneratorGestorRelationshipController;
use App\Http\Controllers\Api\Admin\GeneratorSubgestorRelationshipController;
use App\Models\Branch;
use App\Models\BranchType;
use App\Models\BusinessRole;
use App\Models\Organization;
use App\Models\OrganizationBusinessRole;
use App\Models\OrganizationStatus;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Carga Masiva de Generadores (CSV) por Subgestor/Gestor -- autoservicio
 * confirmado por el usuario, 2026-08-11. Un archivo, una fila = una sede;
 * varias filas con el mismo `(tax_id, tax_id_type)` = varias sedes del mismo
 * Generador. Mismo patrón de parseo `fgetcsv` que
 * `WasteStreamController::import()`/`UnCodeController::import()`, pero
 * agrupado por Generador (no por fila) porque aquí un Generador abarca N
 * filas -- una `DB::transaction()` por GRUPO, no por fila: si un Generador
 * falla, los demás del archivo se siguen procesando.
 *
 * Deduplicación (confirmado explícitamente por el usuario): si el
 * `(tax_id, tax_id_type)` de un grupo YA existe como organización con
 * business_role GENERATOR, NO se tocan sus datos ni sus sedes -- solo se
 * crea/reactiva el vínculo con la organización que ejecuta la carga. Así un
 * Generador nunca queda duplicado y conserva una única cuenta desde la que
 * consulta todo, sin importar cuántos Gestores/Subgestores lo hayan
 * vinculado. Si esa organización ya existente no tiene ningún usuario, SÍ se
 * le crea uno (acceso inmediato); si ya tiene uno, no se duplica.
 */
class GeneratorBulkImportService
{
    private const MAX_ROWS = 10000;

    // Encabezados del CSV en español (decisión del usuario, 2026-08-13, corte
    // limpio -- los nombres en inglés usados antes ya NO se reconocen).
    private const REQUIRED_COLUMNS = ['identificacion', 'tipo_identificacion', 'razon_social', 'nombre_sede'];

    /**
     * @return array{created: int, linked_existing: int, errors: list<array{row: int, message: string}>, generators: list<array<string, mixed>>}
     */
    public function import(UploadedFile $file, Organization $actingOrganization, User $actor, ?string $linkAs = null): array
    {
        [$groups, $errors] = $this->parseAndGroup($file);

        $created = 0;
        $linkedExisting = 0;
        $generators = [];

        foreach ($groups as $group) {
            try {
                $result = DB::transaction(fn () => $this->processGenerator($group, $actingOrganization, $actor, $linkAs));
                $generators[] = $result;
                $result['was_existing'] ? $linkedExisting++ : $created++;
            } catch (ValidationException $e) {
                $errors[] = ['row' => $group['first_row'], 'message' => collect($e->errors())->flatten()->first() ?? 'Error de validación.'];
            } catch (Throwable $e) {
                report($e);
                $errors[] = ['row' => $group['first_row'], 'message' => 'No se pudo procesar este Generador por un error interno.'];
            }
        }

        return ['created' => $created, 'linked_existing' => $linkedExisting, 'errors' => $errors, 'generators' => $generators];
    }

    /**
     * Parsea el CSV y agrupa las filas por `(tax_id, tax_id_type)`. Filas
     * inválidas (columnas requeridas faltantes) se reportan como error
     * individual sin formar parte de ningún grupo -- una fila mal formada
     * dentro de un Generador válido no bloquea las demás sedes de ese mismo
     * Generador.
     *
     * @return array{0: array<string, array{tax_id: string, tax_id_type: string, first_row: int, rows: list<array{row: int, data: array<string, mixed>}>}>, 1: list<array{row: int, message: string}>}
     */
    private function parseAndGroup(UploadedFile $file): array
    {
        $handle = fopen($file->getRealPath(), 'r');
        $header = array_map(fn ($column) => trim((string) $column), fgetcsv($handle) ?: []);

        $groups = [];
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

            $taxId = trim((string) $data['identificacion']);
            $taxIdType = trim((string) $data['tipo_identificacion']);
            $key = $taxId.'|'.$taxIdType;

            $groups[$key]['tax_id'] ??= $taxId;
            $groups[$key]['tax_id_type'] ??= $taxIdType;
            $groups[$key]['first_row'] ??= $rowNumber;
            $groups[$key]['rows'][] = ['row' => $rowNumber, 'data' => $data];
        }

        fclose($handle);

        return [$groups, $errors];
    }

    /**
     * @param  array{tax_id: string, tax_id_type: string, first_row: int, rows: list<array{row: int, data: array<string, mixed>}>}  $group
     * @return array<string, mixed>
     */
    private function processGenerator(array $group, Organization $actingOrganization, User $actor, ?string $linkAs): array
    {
        $firstRowData = $group['rows'][0]['data'];
        $legalName = trim((string) ($firstRowData['razon_social'] ?? ''));

        $existing = Organization::query()
            ->where('tax_id', $group['tax_id'])
            ->where('tax_id_type', $group['tax_id_type'])
            ->first();

        $wasExisting = $existing !== null;
        $branchIds = [];

        if ($existing !== null) {
            if (! $existing->hasCapability('can_generate_waste')) {
                // Hallazgo Crítico (especialista-seguridad, 2026-08-11):
                // mensaje deliberadamente genérico -- confirmar que el NIT
                // pertenece a una organización de OTRO tipo permitiría a
                // cualquier actor enumerar NITs y aprender qué empresas ya
                // están en EcoLink y bajo qué perfil, sin relación alguna
                // con ellas.
                throw ValidationException::withMessages([
                    'identificacion' => ['No fue posible vincular esta fila.'],
                ]);
            }

            // Deduplicación (confirmado por el usuario): NO se tocan los
            // datos ni las sedes de una organización que YA existe -- solo
            // se reutiliza para vincularla, más abajo.
            $organization = $existing;
        } else {
            $this->assertValidTaxIdType($group['tax_id_type']);
            $this->assertOrganizationEmailProvided($firstRowData);
            $organization = $this->createOrganization($group['tax_id'], $group['tax_id_type'], $legalName, $firstRowData, $actor);
            $branchIds = $this->createBranches($organization, $group['rows'], $actor);
        }

        // Hallazgo Crítico (especialista-seguridad, 2026-08-11): el
        // aprovisionamiento de admin SOLO ocurre para una organización
        // RECIÉN CREADA por esta misma llamada -- nunca para una
        // deduplicada/preexistente. Sin este límite, cualquier Subgestor/
        // Gestor que conociera o adivinara el NIT de un Generador YA
        // registrado (por cualquier vía) pero todavía sin ningún usuario
        // provisto podía convertirse en su primer administrador y quedarse
        // con credenciales de acceso a un tenant ajeno, sin su
        // consentimiento. La provisión del primer admin de una organización
        // preexistente queda fuera de este flujo (platform staff / un
        // futuro flujo de invitación verificado).
        $userResult = $wasExisting ? null : $this->provisionAdminIfMissing($organization, $legalName, $firstRowData, $actor);

        $this->linkToActingOrganization($organization, $actingOrganization, $actor, $linkAs);

        return [
            'organization_id' => $organization->id,
            'legal_name' => $organization->legal_name,
            'tax_id' => $organization->tax_id,
            'was_existing' => $wasExisting,
            'branches_created' => count($branchIds),
            // IDs para que el controller registre la trazabilidad de creación
            // de CADA registro (2026-08-14), no solo el total del lote.
            'branch_ids' => $branchIds,
            'user_id' => $userResult['user']->id ?? null,
            'user_created' => $userResult !== null,
            'username' => $userResult['user']->username ?? null,
            'temporary_password' => $userResult['temporary_password'] ?? null,
        ];
    }

    /**
     * @param  array<string, mixed>  $rowData
     */
    private function createOrganization(string $taxId, string $taxIdType, string $legalName, array $rowData, User $actor): Organization
    {
        $activeStatus = OrganizationStatus::query()->where('code', 'ACT')->firstOrFail();

        $organization = Organization::query()->create([
            'legal_name' => $legalName,
            'trade_name' => $this->nullableTrim($rowData['nombre_comercial'] ?? null),
            'tax_id' => $taxId,
            'tax_id_type' => $taxIdType,
            'organization_status_id' => $activeStatus->id,
            'timezone' => 'America/Bogota',
            'country_code' => 'CO',
            'currency_code' => 'COP',
            'email' => $this->nullableTrim($rowData['correo_organizacion'] ?? null),
            'phone' => $this->nullableTrim($rowData['telefono_organizacion'] ?? null),
            'risk_level' => 'bajo',
            'is_active' => true,
            'custom_fields_enabled' => true,
            'created_by' => $actor->id,
            'updated_by' => $actor->id,
        ]);

        // Business_role SIEMPRE forzado a GENERATOR -- este flujo nunca crea
        // organizaciones de otro tipo (Gestor/Subgestor siguen siendo
        // exclusivas de platform staff, sin cambios).
        $generatorRole = BusinessRole::query()->where('code', 'GENERATOR')->firstOrFail();
        OrganizationBusinessRole::query()->updateOrCreate(
            ['organization_id' => $organization->id, 'business_role_id' => $generatorRole->id],
            ['assigned_by' => $actor->id, 'assigned_at' => now(), 'is_active' => true],
        );

        return $organization;
    }

    /**
     * Devuelve los IDs de las sedes creadas (no un conteo): el controller los
     * necesita para registrar la trazabilidad de creación de CADA sede.
     *
     * @param  list<array{row: int, data: array<string, mixed>}>  $rows
     * @return list<int>
     */
    private function createBranches(Organization $organization, array $rows, User $actor): array
    {
        // Sede administrativa por defecto -- el CSV no incluye
        // `branch_type_id` en este primer corte (ver plan), se reclasifica
        // manualmente después desde Sedes si hace falta.
        $branchType = BranchType::query()->where('code', 'ADM')->firstOrFail();
        $createdIds = [];

        foreach ($rows as $rowEntry) {
            $rowData = $rowEntry['data'];

            $createdIds[] = Branch::query()->create([
                'organization_id' => $organization->id,
                'branch_type_id' => $branchType->id,
                'name' => trim((string) $rowData['nombre_sede']),
                'code' => $this->nullableTrim($rowData['codigo_sede'] ?? null),
                'address' => $this->nullableTrim($rowData['direccion_sede'] ?? null),
                'environmental_license' => $this->nullableTrim($rowData['licencia_ambiental'] ?? null),
                'license_expiration_date' => $this->nullableTrim($rowData['fecha_vencimiento_licencia'] ?? null),
                'status' => 'ACTIVE',
                'is_active' => true,
                'created_by' => $actor->id,
                'updated_by' => $actor->id,
            ])->id;
        }

        return $createdIds;
    }

    /**
     * Hallazgo Bajo (especialista-seguridad, 2026-08-11): `tax_id_type`
     * llegaba sin validar contra el mismo catálogo que ya exige
     * `OrganizationController::validationRules()` para el CRUD normal de
     * organizaciones -- permitía crear un Generador con un `tax_id_type`
     * arbitrario.
     */
    private function assertValidTaxIdType(string $taxIdType): void
    {
        $allowed = ['NIT', 'CC', 'CE', 'Pasaporte', 'Tax ID'];

        if (! in_array($taxIdType, $allowed, true)) {
            throw ValidationException::withMessages([
                'tipo_identificacion' => ['tipo_identificacion debe ser uno de: '.implode(', ', $allowed).'.'],
            ]);
        }
    }

    /**
     * Decisión del usuario, 2026-08-13: `correo_organizacion` se vuelve
     * obligatorio SOLO para un Generador NUEVO (mismo criterio que
     * `assertValidTaxIdType()` de arriba -- ambos se invocan únicamente en el
     * branch `else` de `processGenerator()`, nunca para una organización
     * deduplicada, cuyos datos no se tocan). Sin este correo, el admin
     * autoprovisionado (`UserProvisioningService::createActiveAdminForOrganization()`)
     * queda con un correo placeholder no funcional y el aviso de vínculo
     * comercial (`GeneratorRelationshipCreatedNotification`) no tiene a dónde
     * llegar -- ver el respaldo en `GeneratorGestorRelationshipController`/
     * `GeneratorSubgestorRelationshipController::createOrReactivate()`.
     *
     * @param  array<string, mixed>  $rowData
     */
    private function assertOrganizationEmailProvided(array $rowData): void
    {
        $email = $this->nullableTrim($rowData['correo_organizacion'] ?? null);

        if ($email === null || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            throw ValidationException::withMessages([
                'correo_organizacion' => ['correo_organizacion es obligatorio y debe ser un correo válido para un Generador nuevo.'],
            ]);
        }
    }

    /**
     * Crea el usuario ADMINISTRADOR de acceso inmediato. El llamador
     * (`processGenerator()`) SOLO invoca este método para una organización
     * recién creada por esta misma llamada -- nunca para una deduplicada
     * (ver hallazgo Crítico ahí). `$organization->users()->exists()` queda
     * como guarda defensiva adicional (en la práctica siempre `false` aquí,
     * dado que la organización acaba de crearse en la misma transacción).
     *
     * @param  array<string, mixed>  $rowData
     * @return array{user: User, temporary_password: string}|null
     */
    private function provisionAdminIfMissing(Organization $organization, string $legalName, array $rowData, User $actor): ?array
    {
        if ($organization->users()->exists()) {
            return null;
        }

        $requestedUsername = $this->nullableTrim($rowData['nombre_usuario'] ?? null);

        return UserProvisioningService::createActiveAdminForOrganization($organization->id, $legalName, $requestedUsername, $actor);
    }

    /**
     * Crea/reactiva el vínculo con la organización que ejecuta la carga --
     * `generator_gestor_relationships` si actúa como Gestor,
     * `generator_subgestor_relationships` si actúa como Subgestor. Ambas
     * rutas son idempotentes (recargar el mismo CSV no falla ni duplica el
     * vínculo).
     */
    private function linkToActingOrganization(Organization $generatorOrganization, Organization $actingOrganization, User $actor, ?string $linkAs): void
    {
        $effectiveLinkAs = $linkAs ?? ($actingOrganization->hasCapability('can_treat_waste') ? 'gestor' : 'subgestor');

        if ($effectiveLinkAs === 'gestor') {
            GeneratorGestorRelationshipController::createOrReactivate($generatorOrganization->id, $actingOrganization->id, $actor);
        } else {
            GeneratorSubgestorRelationshipController::createOrReactivate($generatorOrganization->id, $actingOrganization->id, $actor);
        }
    }

    private function nullableTrim(mixed $value): ?string
    {
        $trimmed = trim((string) ($value ?? ''));

        return $trimmed === '' ? null : $trimmed;
    }
}
