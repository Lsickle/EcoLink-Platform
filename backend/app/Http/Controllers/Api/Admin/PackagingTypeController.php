<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\PackagingType;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * Catálogo Maestro "Tipos de Embalaje" -- Batch 3/3 (último) de Catálogos
 * Maestros. Datos REALES confirmados (29 valores, ver
 * database/seeders/PackagingTypeSeeder.php). CRUD completo, mismo patrón
 * EXACTO que `HazardCharacteristicController`/`WasteCategoryController` --
 * SIN `tenant_organization_id`/`created_by`/`updated_by` (`packaging_types`
 * no tiene esas columnas, catálogo 100% global). Gateado por
 * `packaging_types.read`/`packaging_types.manage`.
 */
class PackagingTypeController extends Controller
{
    public function index(Request $request)
    {
        Gate::authorize('viewAny', PackagingType::class);

        $search = $request->input('search');
        $status = $request->input('status');

        $sortableColumns = ['code', 'name', 'is_active', 'created_at'];
        $sort = in_array($request->input('sort'), $sortableColumns, true) ? $request->input('sort') : 'code';
        $direction = strtolower((string) $request->input('direction')) === 'desc' ? 'desc' : 'asc';

        $packagingTypes = PackagingType::query()
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

        return response()->json($packagingTypes);
    }

    public function show(PackagingType $packagingType)
    {
        Gate::authorize('view', $packagingType);

        return response()->json(['packaging_type' => $packagingType]);
    }

    public function store(Request $request)
    {
        Gate::authorize('create', PackagingType::class);

        $data = $request->validate([
            'code' => ['required', 'string', 'max:50', 'unique:packaging_types,code'],
            'name' => ['required', 'string', 'max:255', 'unique:packaging_types,name'],
        ]);

        $packagingType = PackagingType::query()->create([
            ...$data,
            'is_system' => false,
            'is_active' => true,
        ]);

        return response()->json(['packaging_type' => $packagingType], 201);
    }

    public function update(Request $request, PackagingType $packagingType)
    {
        Gate::authorize('update', $packagingType);

        $data = $request->validate([
            'code' => ['sometimes', 'string', 'max:50', Rule::unique('packaging_types', 'code')->ignore($packagingType->id)],
            'name' => ['sometimes', 'string', 'max:255', Rule::unique('packaging_types', 'name')->ignore($packagingType->id)],
        ]);

        $packagingType->fill($data);
        $packagingType->save();

        return response()->json(['packaging_type' => $packagingType]);
    }

    public function activate(PackagingType $packagingType)
    {
        Gate::authorize('update', $packagingType);

        $packagingType->forceFill(['is_active' => true])->save();

        return response()->json(['packaging_type' => $packagingType->fresh()]);
    }

    public function deactivate(PackagingType $packagingType)
    {
        Gate::authorize('update', $packagingType);

        $packagingType->forceFill(['is_active' => false])->save();

        return response()->json(['packaging_type' => $packagingType->fresh()]);
    }
}
