<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\HazardCharacteristic;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * Catálogo Maestro "Características de Peligrosidad" -- Batch 2/3 de
 * Catálogos Maestros (RESPEL). CRUD completo, mismo patrón EXACTO que
 * `BranchTypeController` -- SIN `tenant_organization_id`/`created_by`/
 * `updated_by` (`hazard_characteristics` no tiene esas columnas, catálogo
 * 100% global, ver esquema-bd item 14). Gateado por
 * `hazard_characteristics.read`/`hazard_characteristics.manage`.
 *
 * `risk_level` (mayor = más peligroso) se expone tal cual en cada fila; el
 * listado admite `sort=risk_level&direction=desc` para el orden "mayor
 * riesgo primero" que pide la UI.
 */
class HazardCharacteristicController extends Controller
{
    public function index(Request $request)
    {
        Gate::authorize('viewAny', HazardCharacteristic::class);

        $search = $request->input('search');
        $status = $request->input('status');

        $sortableColumns = ['code', 'name', 'risk_level', 'is_active', 'created_at'];
        $sort = in_array($request->input('sort'), $sortableColumns, true) ? $request->input('sort') : 'code';
        $direction = strtolower((string) $request->input('direction')) === 'desc' ? 'desc' : 'asc';

        $hazardCharacteristics = HazardCharacteristic::query()
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

        return response()->json($hazardCharacteristics);
    }

    public function show(HazardCharacteristic $hazardCharacteristic)
    {
        Gate::authorize('view', $hazardCharacteristic);

        return response()->json(['hazard_characteristic' => $hazardCharacteristic]);
    }

    public function store(Request $request)
    {
        Gate::authorize('create', HazardCharacteristic::class);

        $data = $request->validate([
            'code' => ['required', 'string', 'max:50', 'unique:hazard_characteristics,code'],
            'name' => ['required', 'string', 'max:255', 'unique:hazard_characteristics,name'],
            'risk_level' => ['required', 'integer', 'min:1', 'max:9'],
            'description' => ['nullable', 'string'],
        ]);

        $hazardCharacteristic = HazardCharacteristic::query()->create([
            ...$data,
            'is_system' => false,
            'is_active' => true,
        ]);

        return response()->json(['hazard_characteristic' => $hazardCharacteristic], 201);
    }

    public function update(Request $request, HazardCharacteristic $hazardCharacteristic)
    {
        Gate::authorize('update', $hazardCharacteristic);

        $data = $request->validate([
            'code' => ['sometimes', 'string', 'max:50', Rule::unique('hazard_characteristics', 'code')->ignore($hazardCharacteristic->id)],
            'name' => ['sometimes', 'string', 'max:255', Rule::unique('hazard_characteristics', 'name')->ignore($hazardCharacteristic->id)],
            'risk_level' => ['sometimes', 'integer', 'min:1', 'max:9'],
            'description' => ['sometimes', 'nullable', 'string'],
        ]);

        $hazardCharacteristic->fill($data);
        $hazardCharacteristic->save();

        return response()->json(['hazard_characteristic' => $hazardCharacteristic]);
    }

    public function activate(HazardCharacteristic $hazardCharacteristic)
    {
        Gate::authorize('update', $hazardCharacteristic);

        $hazardCharacteristic->forceFill(['is_active' => true])->save();

        return response()->json(['hazard_characteristic' => $hazardCharacteristic->fresh()]);
    }

    public function deactivate(HazardCharacteristic $hazardCharacteristic)
    {
        Gate::authorize('update', $hazardCharacteristic);

        $hazardCharacteristic->forceFill(['is_active' => false])->save();

        return response()->json(['hazard_characteristic' => $hazardCharacteristic->fresh()]);
    }
}
