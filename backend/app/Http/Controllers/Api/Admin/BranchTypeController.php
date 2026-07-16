<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\BranchType;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * Catálogo Maestro "Tipos de Sede" -- Batch 1/3 de Catálogos Maestros.
 * CRUD completo (a diferencia de los 4 catálogos geográficos hermanos, que
 * son de solo lectura) -- mismo patrón que `UnCodeController`/
 * `WasteStreamController`, pero SIN `tenant_organization_id`/`created_by`/
 * `updated_by` (`branch_types` no tiene esas columnas -- catálogo 100%
 * global, ver migración `create_branch_types_table`). Gateado por
 * `branch_types.read`/`branch_types.manage` -- gap señalado en el resumen
 * entregado al hilo principal (`PermissionSeeder` no tenía permisos para
 * este módulo antes de este lote).
 */
class BranchTypeController extends Controller
{
    public function index(Request $request)
    {
        Gate::authorize('viewAny', BranchType::class);

        $search = $request->input('search');
        $status = $request->input('status');

        $sortableColumns = ['code', 'name', 'category', 'sort_order', 'is_active', 'created_at'];
        $sort = in_array($request->input('sort'), $sortableColumns, true) ? $request->input('sort') : 'sort_order';
        $direction = strtolower((string) $request->input('direction')) === 'desc' ? 'desc' : 'asc';

        $branchTypes = BranchType::query()
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

        return response()->json($branchTypes);
    }

    public function show(BranchType $branchType)
    {
        Gate::authorize('view', $branchType);

        return response()->json(['branch_type' => $branchType]);
    }

    public function store(Request $request)
    {
        Gate::authorize('create', BranchType::class);

        $data = $request->validate([
            'code' => ['required', 'string', 'max:50', 'unique:branch_types,code'],
            'name' => ['required', 'string', 'max:255', 'unique:branch_types,name'],
            'category' => ['required', 'string', 'max:100'],
            'is_logistics' => ['sometimes', 'boolean'],
            'is_storage' => ['sometimes', 'boolean'],
            'is_treatment' => ['sometimes', 'boolean'],
            'is_dispatch' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer'],
        ]);

        $branchType = BranchType::query()->create([
            ...$data,
            'is_active' => true,
        ]);

        return response()->json(['branch_type' => $branchType], 201);
    }

    public function update(Request $request, BranchType $branchType)
    {
        Gate::authorize('update', $branchType);

        $data = $request->validate([
            'code' => ['sometimes', 'string', 'max:50', Rule::unique('branch_types', 'code')->ignore($branchType->id)],
            'name' => ['sometimes', 'string', 'max:255', Rule::unique('branch_types', 'name')->ignore($branchType->id)],
            'category' => ['sometimes', 'string', 'max:100'],
            'is_logistics' => ['sometimes', 'boolean'],
            'is_storage' => ['sometimes', 'boolean'],
            'is_treatment' => ['sometimes', 'boolean'],
            'is_dispatch' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer'],
        ]);

        $branchType->fill($data);
        $branchType->save();

        return response()->json(['branch_type' => $branchType]);
    }

    public function activate(BranchType $branchType)
    {
        Gate::authorize('update', $branchType);

        $branchType->forceFill(['is_active' => true])->save();

        return response()->json(['branch_type' => $branchType->fresh()]);
    }

    public function deactivate(BranchType $branchType)
    {
        Gate::authorize('update', $branchType);

        $branchType->forceFill(['is_active' => false])->save();

        return response()->json(['branch_type' => $branchType->fresh()]);
    }
}
