<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Department;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/**
 * Catálogo Maestro "Departamentos" (DANE) -- Batch 1/3 de Catálogos
 * Maestros. Ver `CountryController` para el criterio completo (mismo
 * patrón: catálogo de referencia global, solo lectura desde la UI/API,
 * `geography.read`/`geography.manage`). `index` filtra en cascada por
 * `country_id` (padre de la jerarquía geográfica, D-P01).
 */
class DepartmentController extends Controller
{
    public function index(Request $request)
    {
        Gate::authorize('viewAny', Department::class);

        $search = $request->input('search');
        $status = $request->input('status');
        $countryId = $request->input('country_id');

        $sortableColumns = ['dane_code', 'name', 'is_active', 'created_at'];
        $sort = in_array($request->input('sort'), $sortableColumns, true) ? $request->input('sort') : 'name';
        $direction = strtolower((string) $request->input('direction')) === 'desc' ? 'desc' : 'asc';

        $departments = Department::query()
            ->when($countryId, fn ($query) => $query->where('country_id', $countryId))
            ->when($search, function ($query) use ($search) {
                $query->where(function ($query) use ($search) {
                    $query->where('dane_code', 'ILIKE', "%{$search}%")
                        ->orWhere('name', 'ILIKE', "%{$search}%");
                });
            })
            ->when($status === 'active', fn ($query) => $query->where('is_active', true))
            ->when($status === 'inactive', fn ($query) => $query->where('is_active', false))
            ->orderBy($sort, $direction)
            ->paginate($request->integer('per_page', 15));

        return response()->json($departments);
    }

    public function show(Department $department)
    {
        Gate::authorize('view', $department);

        return response()->json(['department' => $department]);
    }

    public function activate(Department $department)
    {
        Gate::authorize('update', $department);

        $department->forceFill(['is_active' => true])->save();

        return response()->json(['department' => $department->fresh()]);
    }

    public function deactivate(Department $department)
    {
        Gate::authorize('update', $department);

        $department->forceFill(['is_active' => false])->save();

        return response()->json(['department' => $department->fresh()]);
    }
}
