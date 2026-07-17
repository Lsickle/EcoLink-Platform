<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\WasteOperationalStatus;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * Catálogo Maestro "Estado Operativo de Residuo" (Módulo Residuos, núcleo).
 * CRUD completo, mismo patrón EXACTO que `PhysicalStateController`. Gateado
 * por `waste_operational_statuses.read`/`waste_operational_statuses.manage`.
 *
 * DISTINTO de `wastes.status` (workflow de declaración BR/DEC/REV/CLS/RCH,
 * ver `WasteController`) -- no confundirlos, son dos conceptos distintos.
 */
class WasteOperationalStatusController extends Controller
{
    public function index(Request $request)
    {
        Gate::authorize('viewAny', WasteOperationalStatus::class);

        $search = $request->input('search');
        $status = $request->input('status');

        $sortableColumns = ['code', 'name', 'is_active', 'created_at'];
        $sort = in_array($request->input('sort'), $sortableColumns, true) ? $request->input('sort') : 'code';
        $direction = strtolower((string) $request->input('direction')) === 'desc' ? 'desc' : 'asc';

        $wasteOperationalStatuses = WasteOperationalStatus::query()
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

        return response()->json($wasteOperationalStatuses);
    }

    public function show(WasteOperationalStatus $wasteOperationalStatus)
    {
        Gate::authorize('view', $wasteOperationalStatus);

        return response()->json(['waste_operational_status' => $wasteOperationalStatus]);
    }

    public function store(Request $request)
    {
        Gate::authorize('create', WasteOperationalStatus::class);

        $data = $request->validate([
            'code' => ['required', 'string', 'max:50', 'unique:waste_operational_statuses,code'],
            'name' => ['required', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string'],
        ]);

        $wasteOperationalStatus = WasteOperationalStatus::query()->create([
            ...$data,
            'is_system' => false,
            'is_active' => true,
        ]);

        return response()->json(['waste_operational_status' => $wasteOperationalStatus], 201);
    }

    public function update(Request $request, WasteOperationalStatus $wasteOperationalStatus)
    {
        Gate::authorize('update', $wasteOperationalStatus);

        $data = $request->validate([
            'code' => ['sometimes', 'string', 'max:50', Rule::unique('waste_operational_statuses', 'code')->ignore($wasteOperationalStatus->id)],
            'name' => ['sometimes', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string'],
        ]);

        $wasteOperationalStatus->fill($data);
        $wasteOperationalStatus->save();

        return response()->json(['waste_operational_status' => $wasteOperationalStatus]);
    }

    public function activate(WasteOperationalStatus $wasteOperationalStatus)
    {
        Gate::authorize('update', $wasteOperationalStatus);

        $wasteOperationalStatus->forceFill(['is_active' => true])->save();

        return response()->json(['waste_operational_status' => $wasteOperationalStatus->fresh()]);
    }

    public function deactivate(WasteOperationalStatus $wasteOperationalStatus)
    {
        Gate::authorize('update', $wasteOperationalStatus);

        $wasteOperationalStatus->forceFill(['is_active' => false])->save();

        return response()->json(['waste_operational_status' => $wasteOperationalStatus->fresh()]);
    }
}
