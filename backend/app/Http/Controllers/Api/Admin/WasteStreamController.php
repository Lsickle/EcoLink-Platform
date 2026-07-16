<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\WasteStream;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Primer módulo real del dominio Residuos: catálogo "Corrientes de
 * Residuos" (Y/A, Convenio de Basilea / Decreto 1076 de 2015). Catálogo
 * GLOBAL (tenant_organization_id NULL) editable por ADMINISTRADOR -- a
 * diferencia de PermissionController (catálogo de solo lectura), aquí SÍ
 * hay create/update/activate/deactivate/import reales.
 *
 * Alcance de este lote (plan aprobado, no reabrir): NO se agregan columnas
 * de peligrosidad/estado físico -- pertenecen al futuro residuo, no a la
 * corriente. `waste_streams` y `un_codes` son catálogos independientes,
 * sin FK entre sí.
 */
class WasteStreamController extends Controller
{
    /**
     * Filtros: `search` (ILIKE code/name), `status` (active/inactive),
     * `tipo` (Y/A, igualdad exacta -- exclusivo de este controlador),
     * `sort`/`direction` (whitelist explícita, mismo patrón que
     * RoleController::index()). Tenant-scoping: corriente global O del
     * propio tenant del actor (WasteStream::isAccessibleBy()).
     */
    public function index(Request $request)
    {
        Gate::authorize('viewAny', WasteStream::class);

        $actorTenantId = $request->user()->tenant_organization_id;

        $search = $request->input('search');
        $status = $request->input('status');
        $tipo = $request->input('tipo');

        $sortableColumns = ['code', 'name', 'is_active', 'created_at'];
        $sort = in_array($request->input('sort'), $sortableColumns, true) ? $request->input('sort') : 'code';
        $direction = strtolower((string) $request->input('direction')) === 'desc' ? 'desc' : 'asc';

        $wasteStreams = WasteStream::query()
            ->where(function ($query) use ($actorTenantId) {
                $query->whereNull('tenant_organization_id');

                if ($actorTenantId !== null) {
                    $query->orWhere('tenant_organization_id', $actorTenantId);
                }
            })
            ->when($search, function ($query) use ($search) {
                $query->where(function ($query) use ($search) {
                    $query->where('code', 'ILIKE', "%{$search}%")
                        ->orWhere('name', 'ILIKE', "%{$search}%");
                });
            })
            ->when($status === 'active', fn ($query) => $query->where('is_active', true))
            ->when($status === 'inactive', fn ($query) => $query->where('is_active', false))
            ->when(in_array($tipo, ['Y', 'A'], true), fn ($query) => $query->where('tipo', $tipo))
            ->orderBy($sort, $direction)
            ->paginate($request->integer('per_page', 15));

        return response()->json($wasteStreams);
    }

    public function show(WasteStream $wasteStream)
    {
        Gate::authorize('view', $wasteStream);

        $wasteStream->load(['createdBy:id,username', 'updatedBy:id,username']);

        return response()->json(['waste_stream' => $wasteStream]);
    }

    /**
     * SIEMPRE fija `tenant_organization_id` del actor autenticado (nunca
     * del input del cliente) e `is_system=false` -- los creados por un
     * admin vía API no son del sistema, a diferencia de los sembrados por
     * WasteStreamSeeder.
     */
    public function store(Request $request)
    {
        Gate::authorize('create', WasteStream::class);

        $data = $request->validate([
            'code' => ['required', 'string', 'max:50', 'unique:waste_streams,code'],
            // `name` es TEXT en BD (no VARCHAR(255)) -- ver aviso en la
            // migración: 8 de las 179 filas reales del catálogo Basilea
            // exceden 255 caracteres.
            'name' => ['required', 'string'],
            'tipo' => ['required', 'string', Rule::in(['Y', 'A'])],
            'description' => ['nullable', 'string'],
            'requires_manifest' => ['sometimes', 'boolean'],
            'requires_special_transport' => ['sometimes', 'boolean'],
        ]);

        $wasteStream = WasteStream::query()->create([
            ...$data,
            'tenant_organization_id' => $request->user()->tenant_organization_id,
            'is_system' => false,
            'is_active' => true,
            'created_by' => $request->user()->id,
            'updated_by' => $request->user()->id,
        ]);

        return response()->json(['waste_stream' => $wasteStream], 201);
    }

    /**
     * `tipo` no se puede modificar una vez creada la corriente (ninguna
     * corriente, sea de sistema o no); `code` de una corriente de sistema
     * (`is_system=true`) tampoco -- mismo criterio de protección que
     * `is_editable` en Roles.
     */
    public function update(Request $request, WasteStream $wasteStream)
    {
        Gate::authorize('update', $wasteStream);

        if ($request->has('tipo') && $request->input('tipo') !== $wasteStream->tipo) {
            throw ValidationException::withMessages([
                'tipo' => ['El tipo (Y/A) no puede modificarse una vez creada la corriente.'],
            ]);
        }

        if ($wasteStream->is_system && $request->has('code') && $request->input('code') !== $wasteStream->code) {
            throw ValidationException::withMessages([
                'code' => ['No se puede modificar el código de una corriente de sistema.'],
            ]);
        }

        $data = $request->validate([
            'code' => ['sometimes', 'string', 'max:50', Rule::unique('waste_streams', 'code')->ignore($wasteStream->id)],
            'name' => ['sometimes', 'string'],
            'description' => ['sometimes', 'nullable', 'string'],
            'requires_manifest' => ['sometimes', 'boolean'],
            'requires_special_transport' => ['sometimes', 'boolean'],
        ]);

        $wasteStream->fill($data);
        $wasteStream->updated_by = $request->user()->id;
        $wasteStream->save();

        return response()->json(['waste_stream' => $wasteStream]);
    }

    public function activate(Request $request, WasteStream $wasteStream)
    {
        Gate::authorize('update', $wasteStream);

        $wasteStream->forceFill(['is_active' => true, 'updated_by' => $request->user()->id])->save();

        return response()->json(['waste_stream' => $wasteStream->fresh()]);
    }

    public function deactivate(Request $request, WasteStream $wasteStream)
    {
        Gate::authorize('update', $wasteStream);

        $wasteStream->forceFill(['is_active' => false, 'updated_by' => $request->user()->id])->save();

        return response()->json(['waste_stream' => $wasteStream->fresh()]);
    }

    /**
     * Importación masiva por CSV (encabezados esperados: `code,name,tipo`,
     * con `description`/`requires_manifest`/`requires_special_transport`
     * como columnas extra opcionales). Cada fila se procesa de forma
     * INDEPENDIENTE (transacción propia por fila) -- una fila inválida o
     * que falle no revierte ni aborta el procesamiento de las demás.
     *
     * Hallazgo Crítico (especialista-seguridad, 2026-07-15): la versión
     * original localizaba/actualizaba filas existentes por `code` SIN
     * ningún chequeo de tenant ni de `is_system` -- un admin de un tenant
     * podía subir un CSV con el `code` de una corriente de OTRO tenant (o
     * del catálogo global sembrado) y secuestrarla: le cambiaba `name`,
     * REASIGNABA `tenant_organization_id` a su propio tenant, y evadía por
     * completo las protecciones de `tipo`/`code` de `is_system=true` que
     * `update()` sí aplica. Corregido: para una fila existente, se exige el
     * MISMO Gate `update` (`isAccessibleBy()` + permiso `manage`) y las
     * MISMAS reglas de inmutabilidad de `tipo` que usa `update()` -- si no
     * pasa, la fila se reporta en `errors` sin tocar el registro, nunca se
     * reasigna `tenant_organization_id`/`is_system` de un registro
     * preexistente (esos campos solo se fijan al CREAR).
     */
    public function import(Request $request)
    {
        Gate::authorize('create', WasteStream::class);

        $request->validate([
            // Hallazgo Alto: sin límite de tamaño, un CSV enorme podría
            // agotar tiempo/memoria en un request síncrono.
            'file' => ['required', 'file', 'mimes:csv,txt', 'max:5120'],
        ]);

        $handle = fopen($request->file('file')->getRealPath(), 'r');
        $header = array_map(fn ($column) => trim((string) $column), fgetcsv($handle) ?: []);

        $created = 0;
        $updated = 0;
        $errors = [];
        $rowNumber = 1;
        $maxRows = 10000;

        while (($row = fgetcsv($handle)) !== false) {
            $rowNumber++;

            if ($rowNumber - 1 > $maxRows) {
                $errors[] = ['row' => $rowNumber, 'message' => "Se alcanzó el máximo de {$maxRows} filas por archivo; el resto no se procesó."];

                break;
            }

            $data = array_combine($header, array_pad($row, count($header), null));

            $code = trim((string) ($data['code'] ?? ''));
            $name = trim((string) ($data['name'] ?? ''));

            if ($code === '' || $name === '') {
                $errors[] = ['row' => $rowNumber, 'message' => 'Las columnas code y name son requeridas.'];

                continue;
            }

            $existing = WasteStream::query()->where('code', $code)->first();

            if ($existing && ! Gate::allows('update', $existing)) {
                $errors[] = ['row' => $rowNumber, 'message' => "No tiene permiso para modificar la corriente con código {$code}."];

                continue;
            }

            $newTipo = array_key_exists('tipo', $data) && trim((string) $data['tipo']) !== ''
                ? strtoupper(trim((string) $data['tipo']))
                : null;

            if ($existing && $newTipo !== null && $newTipo !== $existing->tipo) {
                $errors[] = ['row' => $rowNumber, 'message' => "El tipo (Y/A) no puede modificarse para la corriente con código {$code}."];

                continue;
            }

            if (! $existing && ($newTipo === null || ! in_array($newTipo, ['Y', 'A'], true))) {
                $errors[] = ['row' => $rowNumber, 'message' => 'La columna tipo (Y/A) es requerida para crear una corriente nueva.'];

                continue;
            }

            try {
                DB::transaction(function () use ($data, $code, $name, $newTipo, $existing, $request, &$created, &$updated) {
                    $attributes = [
                        'name' => $name,
                        'updated_by' => $request->user()->id,
                    ];

                    if (! $existing) {
                        // Solo se fijan al CREAR -- nunca se reasignan en un
                        // registro preexistente (ver hallazgo Crítico arriba).
                        $attributes['tenant_organization_id'] = $request->user()->tenant_organization_id;
                        $attributes['is_system'] = false;
                        $attributes['is_active'] = true;
                        $attributes['created_by'] = $request->user()->id;
                        $attributes['tipo'] = $newTipo;
                    }

                    if (array_key_exists('description', $data) && trim((string) $data['description']) !== '') {
                        $attributes['description'] = $data['description'];
                    }

                    if (array_key_exists('requires_manifest', $data) && $data['requires_manifest'] !== null && $data['requires_manifest'] !== '') {
                        $attributes['requires_manifest'] = filter_var($data['requires_manifest'], FILTER_VALIDATE_BOOLEAN);
                    }

                    if (array_key_exists('requires_special_transport', $data) && $data['requires_special_transport'] !== null && $data['requires_special_transport'] !== '') {
                        $attributes['requires_special_transport'] = filter_var($data['requires_special_transport'], FILTER_VALIDATE_BOOLEAN);
                    }

                    WasteStream::query()->updateOrCreate(['code' => $code], $attributes);

                    $existing ? $updated++ : $created++;
                });
            } catch (\Throwable $e) {
                // Hallazgo Bajo: no devolver el mensaje crudo de la
                // excepción al cliente (puede filtrar detalles internos de
                // BD) -- se registra completo en logs, el cliente recibe un
                // mensaje genérico.
                report($e);
                $errors[] = ['row' => $rowNumber, 'message' => 'No se pudo procesar esta fila por un error interno.'];
            }
        }

        fclose($handle);

        return response()->json(['created' => $created, 'updated' => $updated, 'errors' => $errors]);
    }
}
