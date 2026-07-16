<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\WasteCategory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * Catálogo Maestro "Categoría de Residuo" -- Batch 2/3 de Catálogos
 * Maestros (RESPEL). CRUD completo, mismo patrón EXACTO que
 * `BranchTypeController` -- SIN `tenant_organization_id`/`created_by`/
 * `updated_by` (`waste_categories` no tiene esas columnas, catálogo 100%
 * global -- D-R05, esquema-bd item 14: solo ADMINISTRADOR gestiona, la
 * activación por organización se difiere al módulo Residuos y no se
 * construye en este lote). Gateado por `waste_categories.read`/
 * `waste_categories.manage`.
 */
class WasteCategoryController extends Controller
{
    public function index(Request $request)
    {
        Gate::authorize('viewAny', WasteCategory::class);

        $search = $request->input('search');
        $status = $request->input('status');

        $sortableColumns = ['code', 'name', 'is_active', 'created_at'];
        $sort = in_array($request->input('sort'), $sortableColumns, true) ? $request->input('sort') : 'code';
        $direction = strtolower((string) $request->input('direction')) === 'desc' ? 'desc' : 'asc';

        $wasteCategories = WasteCategory::query()
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

        return response()->json($wasteCategories);
    }

    public function show(WasteCategory $wasteCategory)
    {
        Gate::authorize('view', $wasteCategory);

        return response()->json(['waste_category' => $wasteCategory]);
    }

    public function store(Request $request)
    {
        Gate::authorize('create', WasteCategory::class);

        $data = $request->validate([
            'code' => ['required', 'string', 'max:50', 'unique:waste_categories,code'],
            'name' => ['required', 'string', 'max:255', 'unique:waste_categories,name'],
            'description' => ['nullable', 'string'],
        ]);

        $wasteCategory = WasteCategory::query()->create([
            ...$data,
            'is_system' => false,
            'is_active' => true,
        ]);

        return response()->json(['waste_category' => $wasteCategory], 201);
    }

    public function update(Request $request, WasteCategory $wasteCategory)
    {
        Gate::authorize('update', $wasteCategory);

        $data = $request->validate([
            'code' => ['sometimes', 'string', 'max:50', Rule::unique('waste_categories', 'code')->ignore($wasteCategory->id)],
            'name' => ['sometimes', 'string', 'max:255', Rule::unique('waste_categories', 'name')->ignore($wasteCategory->id)],
            'description' => ['sometimes', 'nullable', 'string'],
        ]);

        $wasteCategory->fill($data);
        $wasteCategory->save();

        return response()->json(['waste_category' => $wasteCategory]);
    }

    public function activate(WasteCategory $wasteCategory)
    {
        Gate::authorize('update', $wasteCategory);

        $wasteCategory->forceFill(['is_active' => true])->save();

        return response()->json(['waste_category' => $wasteCategory->fresh()]);
    }

    public function deactivate(WasteCategory $wasteCategory)
    {
        Gate::authorize('update', $wasteCategory);

        $wasteCategory->forceFill(['is_active' => false])->save();

        return response()->json(['waste_category' => $wasteCategory->fresh()]);
    }
}
