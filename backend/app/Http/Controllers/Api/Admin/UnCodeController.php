<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\UnCode;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Catálogo de Códigos ONU de transporte de mercancías peligrosas.
 * Independiente de `waste_streams` (sin FK/relación 1:1 en este lote) --
 * ver WasteStreamController para el módulo hermano, mismo patrón exacto.
 */
class UnCodeController extends Controller
{
    /**
     * Filtros: `search` (ILIKE code/name), `status` (active/inactive),
     * `sort`/`direction` (whitelist explícita). Tenant-scoping: código
     * global O del propio tenant del actor (UnCode::isAccessibleBy()).
     */
    public function index(Request $request)
    {
        Gate::authorize('viewAny', UnCode::class);

        $actorTenantId = $request->user()->tenant_organization_id;

        $search = $request->input('search');
        $status = $request->input('status');

        $sortableColumns = ['code', 'name', 'is_active', 'created_at'];
        $sort = in_array($request->input('sort'), $sortableColumns, true) ? $request->input('sort') : 'code';
        $direction = strtolower((string) $request->input('direction')) === 'desc' ? 'desc' : 'asc';

        $unCodes = UnCode::query()
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
            ->orderBy($sort, $direction)
            ->paginate($request->integer('per_page', 15));

        return response()->json($unCodes);
    }

    public function show(UnCode $unCode)
    {
        Gate::authorize('view', $unCode);

        $unCode->load(['createdBy:id,username', 'updatedBy:id,username']);

        return response()->json(['un_code' => $unCode]);
    }

    /**
     * SIEMPRE fija `tenant_organization_id` del actor autenticado (nunca
     * del input del cliente) e `is_system=false`.
     */
    public function store(Request $request)
    {
        Gate::authorize('create', UnCode::class);

        $data = $request->validate([
            'code' => ['required', 'string', 'max:50', 'unique:un_codes,code'],
            'name' => ['required', 'string', 'max:255'],
            'hazard_class' => ['nullable', 'string'],
            'packing_group' => ['nullable', 'string'],
        ]);

        $unCode = UnCode::query()->create([
            ...$data,
            'tenant_organization_id' => $request->user()->tenant_organization_id,
            'is_system' => false,
            'is_active' => true,
            'created_by' => $request->user()->id,
            'updated_by' => $request->user()->id,
        ]);

        return response()->json(['un_code' => $unCode], 201);
    }

    /**
     * `code` de un código de sistema (`is_system=true`) no puede
     * modificarse -- mismo criterio de protección que WasteStreamController
     * (no aplica la protección de `tipo`, `UnCode` no tiene ese campo).
     */
    public function update(Request $request, UnCode $unCode)
    {
        Gate::authorize('update', $unCode);

        if ($unCode->is_system && $request->has('code') && $request->input('code') !== $unCode->code) {
            throw ValidationException::withMessages([
                'code' => ['No se puede modificar el código de un código UN de sistema.'],
            ]);
        }

        $data = $request->validate([
            'code' => ['sometimes', 'string', 'max:50', Rule::unique('un_codes', 'code')->ignore($unCode->id)],
            'name' => ['sometimes', 'string', 'max:255'],
            'hazard_class' => ['sometimes', 'nullable', 'string'],
            'packing_group' => ['sometimes', 'nullable', 'string'],
        ]);

        $unCode->fill($data);
        $unCode->updated_by = $request->user()->id;
        $unCode->save();

        return response()->json(['un_code' => $unCode]);
    }

    public function activate(Request $request, UnCode $unCode)
    {
        Gate::authorize('update', $unCode);

        $unCode->forceFill(['is_active' => true, 'updated_by' => $request->user()->id])->save();

        return response()->json(['un_code' => $unCode->fresh()]);
    }

    public function deactivate(Request $request, UnCode $unCode)
    {
        Gate::authorize('update', $unCode);

        $unCode->forceFill(['is_active' => false, 'updated_by' => $request->user()->id])->save();

        return response()->json(['un_code' => $unCode->fresh()]);
    }

    /**
     * Importación masiva por CSV (encabezados esperados: `code,name`, con
     * `hazard_class`/`packing_group` como columnas extra opcionales). Cada
     * fila se procesa de forma INDEPENDIENTE (transacción propia por fila).
     *
     * Hallazgo Crítico (especialista-seguridad, 2026-07-15): mismo problema
     * y misma corrección que `WasteStreamController::import()` -- ver ese
     * docblock para el detalle completo. Aquí no aplica la protección de
     * `tipo` (UnCode no tiene ese campo), solo el Gate `update`
     * (`isAccessibleBy()` + permiso `manage`) antes de tocar una fila
     * existente, y `tenant_organization_id`/`is_system` nunca se reasignan
     * en un registro preexistente.
     */
    public function import(Request $request)
    {
        Gate::authorize('create', UnCode::class);

        $request->validate([
            // Hallazgo Alto: límite de tamaño de archivo.
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

            $existing = UnCode::query()->where('code', $code)->first();

            if ($existing && ! Gate::allows('update', $existing)) {
                $errors[] = ['row' => $rowNumber, 'message' => "No tiene permiso para modificar el código UN {$code}."];

                continue;
            }

            try {
                DB::transaction(function () use ($data, $code, $name, $existing, $request, &$created, &$updated) {
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
                    }

                    if (array_key_exists('hazard_class', $data) && trim((string) $data['hazard_class']) !== '') {
                        $attributes['hazard_class'] = $data['hazard_class'];
                    }

                    if (array_key_exists('packing_group', $data) && trim((string) $data['packing_group']) !== '') {
                        $attributes['packing_group'] = $data['packing_group'];
                    }

                    UnCode::query()->updateOrCreate(['code' => $code], $attributes);

                    $existing ? $updated++ : $created++;
                });
            } catch (\Throwable $e) {
                report($e);
                $errors[] = ['row' => $rowNumber, 'message' => 'No se pudo procesar esta fila por un error interno.'];
            }
        }

        fclose($handle);

        return response()->json(['created' => $created, 'updated' => $updated, 'errors' => $errors]);
    }
}
