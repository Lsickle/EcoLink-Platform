<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\MeasurementUnit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * Catálogo Maestro "Unidad de Medida" (Módulo Residuos, núcleo). CRUD
 * completo, mismo patrón EXACTO que `PhysicalStateController`. Gateado por
 * `measurement_units.read`/`measurement_units.manage`.
 */
class MeasurementUnitController extends Controller
{
    public function index(Request $request)
    {
        Gate::authorize('viewAny', MeasurementUnit::class);

        $search = $request->input('search');
        $status = $request->input('status');

        $sortableColumns = ['code', 'name', 'is_active', 'created_at'];
        $sort = in_array($request->input('sort'), $sortableColumns, true) ? $request->input('sort') : 'code';
        $direction = strtolower((string) $request->input('direction')) === 'desc' ? 'desc' : 'asc';

        $measurementUnits = MeasurementUnit::query()
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

        return response()->json($measurementUnits);
    }

    public function show(MeasurementUnit $measurementUnit)
    {
        Gate::authorize('view', $measurementUnit);

        return response()->json(['measurement_unit' => $measurementUnit]);
    }

    public function store(Request $request)
    {
        Gate::authorize('create', MeasurementUnit::class);

        $data = $request->validate([
            'code' => ['required', 'string', 'max:50', 'unique:measurement_units,code'],
            'name' => ['required', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string'],
        ]);

        $measurementUnit = MeasurementUnit::query()->create([
            ...$data,
            'is_system' => false,
            'is_active' => true,
        ]);

        return response()->json(['measurement_unit' => $measurementUnit], 201);
    }

    public function update(Request $request, MeasurementUnit $measurementUnit)
    {
        Gate::authorize('update', $measurementUnit);

        $data = $request->validate([
            'code' => ['sometimes', 'string', 'max:50', Rule::unique('measurement_units', 'code')->ignore($measurementUnit->id)],
            'name' => ['sometimes', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string'],
        ]);

        $measurementUnit->fill($data);
        $measurementUnit->save();

        return response()->json(['measurement_unit' => $measurementUnit]);
    }

    public function activate(MeasurementUnit $measurementUnit)
    {
        Gate::authorize('update', $measurementUnit);

        $measurementUnit->forceFill(['is_active' => true])->save();

        return response()->json(['measurement_unit' => $measurementUnit->fresh()]);
    }

    public function deactivate(MeasurementUnit $measurementUnit)
    {
        Gate::authorize('update', $measurementUnit);

        $measurementUnit->forceFill(['is_active' => false])->save();

        return response()->json(['measurement_unit' => $measurementUnit->fresh()]);
    }
}
