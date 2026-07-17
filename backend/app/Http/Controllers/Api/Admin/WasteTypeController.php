<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\WasteType;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * Catálogo Maestro "Tipo de Residuo" (Módulo Residuos, núcleo). CRUD
 * completo, mismo patrón EXACTO que `PhysicalStateController` -- SIN
 * `tenant_organization_id`/`created_by`/`updated_by` (`waste_types` no tiene
 * esas columnas, catálogo 100% global). Gateado por `waste_types.read`/
 * `waste_types.manage`.
 */
class WasteTypeController extends Controller
{
    public function index(Request $request)
    {
        Gate::authorize('viewAny', WasteType::class);

        $search = $request->input('search');
        $status = $request->input('status');

        $sortableColumns = ['code', 'name', 'is_active', 'created_at'];
        $sort = in_array($request->input('sort'), $sortableColumns, true) ? $request->input('sort') : 'code';
        $direction = strtolower((string) $request->input('direction')) === 'desc' ? 'desc' : 'asc';

        $wasteTypes = WasteType::query()
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

        return response()->json($wasteTypes);
    }

    public function show(WasteType $wasteType)
    {
        Gate::authorize('view', $wasteType);

        return response()->json(['waste_type' => $wasteType]);
    }

    public function store(Request $request)
    {
        Gate::authorize('create', WasteType::class);

        $data = $request->validate([
            'code' => ['required', 'string', 'max:50', 'unique:waste_types,code'],
            'name' => ['required', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string'],
        ]);

        $wasteType = WasteType::query()->create([
            ...$data,
            'is_system' => false,
            'is_active' => true,
        ]);

        return response()->json(['waste_type' => $wasteType], 201);
    }

    public function update(Request $request, WasteType $wasteType)
    {
        Gate::authorize('update', $wasteType);

        $data = $request->validate([
            'code' => ['sometimes', 'string', 'max:50', Rule::unique('waste_types', 'code')->ignore($wasteType->id)],
            'name' => ['sometimes', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string'],
        ]);

        $wasteType->fill($data);
        $wasteType->save();

        return response()->json(['waste_type' => $wasteType]);
    }

    public function activate(WasteType $wasteType)
    {
        Gate::authorize('update', $wasteType);

        $wasteType->forceFill(['is_active' => true])->save();

        return response()->json(['waste_type' => $wasteType->fresh()]);
    }

    public function deactivate(WasteType $wasteType)
    {
        Gate::authorize('update', $wasteType);

        $wasteType->forceFill(['is_active' => false])->save();

        return response()->json(['waste_type' => $wasteType->fresh()]);
    }
}
