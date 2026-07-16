<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\PackagingCondition;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * Catálogo Maestro "Estados del Embalaje" -- Batch 3/3 (último) de Catálogos
 * Maestros. PROVISIONAL: sin fuente de negocio confirmada, ver AVISO en
 * database/seeders/PackagingConditionSeeder.php. CRUD completo, mismo patrón
 * EXACTO que `HazardCharacteristicController` -- SIN
 * `tenant_organization_id`/`created_by`/`updated_by` (`packaging_conditions`
 * no tiene esas columnas, catálogo 100% global). Gateado por
 * `packaging_conditions.read`/`packaging_conditions.manage`.
 *
 * `risk_level` (mayor = más peligroso) se expone tal cual en cada fila,
 * mismo criterio que `hazard_characteristics`; el listado admite
 * `sort=risk_level&direction=desc`.
 */
class PackagingConditionController extends Controller
{
    public function index(Request $request)
    {
        Gate::authorize('viewAny', PackagingCondition::class);

        $search = $request->input('search');
        $status = $request->input('status');

        $sortableColumns = ['code', 'name', 'risk_level', 'is_active', 'created_at'];
        $sort = in_array($request->input('sort'), $sortableColumns, true) ? $request->input('sort') : 'code';
        $direction = strtolower((string) $request->input('direction')) === 'desc' ? 'desc' : 'asc';

        $packagingConditions = PackagingCondition::query()
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

        return response()->json($packagingConditions);
    }

    public function show(PackagingCondition $packagingCondition)
    {
        Gate::authorize('view', $packagingCondition);

        return response()->json(['packaging_condition' => $packagingCondition]);
    }

    public function store(Request $request)
    {
        Gate::authorize('create', PackagingCondition::class);

        $data = $request->validate([
            'code' => ['required', 'string', 'max:50', 'unique:packaging_conditions,code'],
            'name' => ['required', 'string', 'max:255', 'unique:packaging_conditions,name'],
            'risk_level' => ['nullable', 'integer', 'min:1', 'max:9'],
        ]);

        $packagingCondition = PackagingCondition::query()->create([
            ...$data,
            'is_system' => false,
            'is_active' => true,
        ]);

        return response()->json(['packaging_condition' => $packagingCondition], 201);
    }

    public function update(Request $request, PackagingCondition $packagingCondition)
    {
        Gate::authorize('update', $packagingCondition);

        $data = $request->validate([
            'code' => ['sometimes', 'string', 'max:50', Rule::unique('packaging_conditions', 'code')->ignore($packagingCondition->id)],
            'name' => ['sometimes', 'string', 'max:255', Rule::unique('packaging_conditions', 'name')->ignore($packagingCondition->id)],
            'risk_level' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:9'],
        ]);

        $packagingCondition->fill($data);
        $packagingCondition->save();

        return response()->json(['packaging_condition' => $packagingCondition]);
    }

    public function activate(PackagingCondition $packagingCondition)
    {
        Gate::authorize('update', $packagingCondition);

        $packagingCondition->forceFill(['is_active' => true])->save();

        return response()->json(['packaging_condition' => $packagingCondition->fresh()]);
    }

    public function deactivate(PackagingCondition $packagingCondition)
    {
        Gate::authorize('update', $packagingCondition);

        $packagingCondition->forceFill(['is_active' => false])->save();

        return response()->json(['packaging_condition' => $packagingCondition->fresh()]);
    }
}
