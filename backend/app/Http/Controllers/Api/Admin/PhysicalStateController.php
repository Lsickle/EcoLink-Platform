<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\PhysicalState;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * Catálogo Maestro "Estado Físico" -- Batch 2/3 de Catálogos Maestros
 * (RESPEL). CRUD completo, mismo patrón EXACTO que `BranchTypeController`
 * -- SIN `tenant_organization_id`/`created_by`/`updated_by`
 * (`physical_states` no tiene esas columnas, catálogo 100% global, ver
 * esquema-bd item 14(b)/L-41). Gateado por `physical_states.read`/
 * `physical_states.manage`.
 */
class PhysicalStateController extends Controller
{
    public function index(Request $request)
    {
        Gate::authorize('viewAny', PhysicalState::class);

        $search = $request->input('search');
        $status = $request->input('status');

        $sortableColumns = ['code', 'name', 'is_active', 'created_at'];
        $sort = in_array($request->input('sort'), $sortableColumns, true) ? $request->input('sort') : 'code';
        $direction = strtolower((string) $request->input('direction')) === 'desc' ? 'desc' : 'asc';

        $physicalStates = PhysicalState::query()
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

        return response()->json($physicalStates);
    }

    public function show(PhysicalState $physicalState)
    {
        Gate::authorize('view', $physicalState);

        return response()->json(['physical_state' => $physicalState]);
    }

    public function store(Request $request)
    {
        Gate::authorize('create', PhysicalState::class);

        $data = $request->validate([
            'code' => ['required', 'string', 'max:50', 'unique:physical_states,code'],
            'name' => ['required', 'string', 'max:255', 'unique:physical_states,name'],
        ]);

        $physicalState = PhysicalState::query()->create([
            ...$data,
            'is_system' => false,
            'is_active' => true,
        ]);

        return response()->json(['physical_state' => $physicalState], 201);
    }

    public function update(Request $request, PhysicalState $physicalState)
    {
        Gate::authorize('update', $physicalState);

        $data = $request->validate([
            'code' => ['sometimes', 'string', 'max:50', Rule::unique('physical_states', 'code')->ignore($physicalState->id)],
            'name' => ['sometimes', 'string', 'max:255', Rule::unique('physical_states', 'name')->ignore($physicalState->id)],
        ]);

        $physicalState->fill($data);
        $physicalState->save();

        return response()->json(['physical_state' => $physicalState]);
    }

    public function activate(PhysicalState $physicalState)
    {
        Gate::authorize('update', $physicalState);

        $physicalState->forceFill(['is_active' => true])->save();

        return response()->json(['physical_state' => $physicalState->fresh()]);
    }

    public function deactivate(PhysicalState $physicalState)
    {
        Gate::authorize('update', $physicalState);

        $physicalState->forceFill(['is_active' => false])->save();

        return response()->json(['physical_state' => $physicalState->fresh()]);
    }
}
