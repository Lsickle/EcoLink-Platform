<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Country;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/**
 * Catálogo Maestro "Países" (ISO 3166-1 alpha-2) -- Batch 1/3 de Catálogos
 * Maestros. Catálogo de referencia global, GLOBAL de solo lectura desde la
 * UI/API: sin pantalla de "Crear País" -- solo `index`/`show`/`activate`/
 * `deactivate` (mismo criterio para los 4 catálogos geográficos hermanos,
 * ver `DepartmentController`/`MunicipalityController`/`LocalityController`).
 * Gateado por `geography.read`/`geography.manage` -- gap señalado en el
 * resumen entregado al hilo principal (`PermissionSeeder` no tenía
 * permisos para este módulo antes de este lote).
 */
class CountryController extends Controller
{
    /**
     * Filtros: `search` (ILIKE iso_code/name), `status` (active/inactive),
     * `sort`/`direction` (whitelist explícita) -- mismo patrón que
     * `UnCodeController::index()`. Sin scoping de tenant: `countries` es
     * 100% global.
     */
    public function index(Request $request)
    {
        Gate::authorize('viewAny', Country::class);

        $search = $request->input('search');
        $status = $request->input('status');

        $sortableColumns = ['iso_code', 'name', 'is_active', 'created_at'];
        $sort = in_array($request->input('sort'), $sortableColumns, true) ? $request->input('sort') : 'name';
        $direction = strtolower((string) $request->input('direction')) === 'desc' ? 'desc' : 'asc';

        $countries = Country::query()
            ->when($search, function ($query) use ($search) {
                $query->where(function ($query) use ($search) {
                    $query->where('iso_code', 'ILIKE', "%{$search}%")
                        ->orWhere('name', 'ILIKE', "%{$search}%");
                });
            })
            ->when($status === 'active', fn ($query) => $query->where('is_active', true))
            ->when($status === 'inactive', fn ($query) => $query->where('is_active', false))
            ->orderBy($sort, $direction)
            ->paginate($request->integer('per_page', 15));

        return response()->json($countries);
    }

    public function show(Country $country)
    {
        Gate::authorize('view', $country);

        return response()->json(['country' => $country]);
    }

    public function activate(Country $country)
    {
        Gate::authorize('update', $country);

        $country->forceFill(['is_active' => true])->save();

        return response()->json(['country' => $country->fresh()]);
    }

    public function deactivate(Country $country)
    {
        Gate::authorize('update', $country);

        $country->forceFill(['is_active' => false])->save();

        return response()->json(['country' => $country->fresh()]);
    }
}
