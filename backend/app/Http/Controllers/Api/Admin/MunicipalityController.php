<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Municipality;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/**
 * Catálogo Maestro "Municipios" (DANE) -- Batch 1/3 de Catálogos Maestros.
 * Ver `CountryController` para el criterio completo (mismo patrón). `index`
 * filtra en cascada por `department_id` (D-P01).
 */
class MunicipalityController extends Controller
{
    public function index(Request $request)
    {
        Gate::authorize('viewAny', Municipality::class);

        $search = $request->input('search');
        $status = $request->input('status');
        $departmentId = $request->input('department_id');

        $sortableColumns = ['codigo_dane', 'name', 'is_active', 'created_at'];
        $sort = in_array($request->input('sort'), $sortableColumns, true) ? $request->input('sort') : 'name';
        $direction = strtolower((string) $request->input('direction')) === 'desc' ? 'desc' : 'asc';

        $municipalities = Municipality::query()
            ->when($departmentId, fn ($query) => $query->where('department_id', $departmentId))
            ->when($search, function ($query) use ($search) {
                $query->where(function ($query) use ($search) {
                    $query->where('codigo_dane', 'ILIKE', "%{$search}%")
                        ->orWhere('name', 'ILIKE', "%{$search}%");
                });
            })
            ->when($status === 'active', fn ($query) => $query->where('is_active', true))
            ->when($status === 'inactive', fn ($query) => $query->where('is_active', false))
            ->orderBy($sort, $direction)
            ->paginate($request->integer('per_page', 15));

        return response()->json($municipalities);
    }

    public function show(Municipality $municipality)
    {
        Gate::authorize('view', $municipality);

        return response()->json(['municipality' => $municipality]);
    }

    public function activate(Municipality $municipality)
    {
        Gate::authorize('update', $municipality);

        $municipality->forceFill(['is_active' => true])->save();

        return response()->json(['municipality' => $municipality->fresh()]);
    }

    public function deactivate(Municipality $municipality)
    {
        Gate::authorize('update', $municipality);

        $municipality->forceFill(['is_active' => false])->save();

        return response()->json(['municipality' => $municipality->fresh()]);
    }
}
