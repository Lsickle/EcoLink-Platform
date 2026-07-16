<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Locality;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/**
 * Catálogo Maestro "Localidades" (solo Bogotá D.C. en la práctica) -- Batch
 * 1/3 de Catálogos Maestros. Ver `CountryController` para el criterio
 * completo (mismo patrón). `index` filtra en cascada por `municipality_id`
 * (D-P01, último nivel de la jerarquía geográfica).
 */
class LocalityController extends Controller
{
    public function index(Request $request)
    {
        Gate::authorize('viewAny', Locality::class);

        $search = $request->input('search');
        $status = $request->input('status');
        $municipalityId = $request->input('municipality_id');

        $sortableColumns = ['code', 'name', 'is_active', 'created_at'];
        $sort = in_array($request->input('sort'), $sortableColumns, true) ? $request->input('sort') : 'name';
        $direction = strtolower((string) $request->input('direction')) === 'desc' ? 'desc' : 'asc';

        $localities = Locality::query()
            ->when($municipalityId, fn ($query) => $query->where('municipality_id', $municipalityId))
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

        return response()->json($localities);
    }

    public function show(Locality $locality)
    {
        Gate::authorize('view', $locality);

        return response()->json(['locality' => $locality]);
    }

    public function activate(Locality $locality)
    {
        Gate::authorize('update', $locality);

        $locality->forceFill(['is_active' => true])->save();

        return response()->json(['locality' => $locality->fresh()]);
    }

    public function deactivate(Locality $locality)
    {
        Gate::authorize('update', $locality);

        $locality->forceFill(['is_active' => false])->save();

        return response()->json(['locality' => $locality->fresh()]);
    }
}
