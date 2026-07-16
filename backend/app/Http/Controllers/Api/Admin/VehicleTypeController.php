<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\VehicleType;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * Catálogo Maestro "Tipos de Vehículo" -- Batch 3/3 (último) de Catálogos
 * Maestros. PROVISIONAL: sin fuente de negocio confirmada, ver AVISO en
 * database/seeders/VehicleTypeSeeder.php. Tabla de referencia AISLADA -- NO
 * toca `vehicles.vehicle_type` (esquema-bd), el módulo Vehículos no está
 * construido todavía. CRUD completo, mismo patrón EXACTO que
 * `HazardCharacteristicController` -- SIN
 * `tenant_organization_id`/`created_by`/`updated_by` (`vehicle_types` no
 * tiene esas columnas, catálogo 100% global). Gateado por
 * `vehicle_types.read`/`vehicle_types.manage`.
 */
class VehicleTypeController extends Controller
{
    public function index(Request $request)
    {
        Gate::authorize('viewAny', VehicleType::class);

        $search = $request->input('search');
        $status = $request->input('status');

        $sortableColumns = ['code', 'name', 'category', 'is_active', 'created_at'];
        $sort = in_array($request->input('sort'), $sortableColumns, true) ? $request->input('sort') : 'code';
        $direction = strtolower((string) $request->input('direction')) === 'desc' ? 'desc' : 'asc';

        $vehicleTypes = VehicleType::query()
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

        return response()->json($vehicleTypes);
    }

    public function show(VehicleType $vehicleType)
    {
        Gate::authorize('view', $vehicleType);

        return response()->json(['vehicle_type' => $vehicleType]);
    }

    public function store(Request $request)
    {
        Gate::authorize('create', VehicleType::class);

        $data = $request->validate([
            'code' => ['required', 'string', 'max:50', 'unique:vehicle_types,code'],
            'name' => ['required', 'string', 'max:255', 'unique:vehicle_types,name'],
            'category' => ['nullable', 'string', 'max:100'],
        ]);

        $vehicleType = VehicleType::query()->create([
            ...$data,
            'is_system' => false,
            'is_active' => true,
        ]);

        return response()->json(['vehicle_type' => $vehicleType], 201);
    }

    public function update(Request $request, VehicleType $vehicleType)
    {
        Gate::authorize('update', $vehicleType);

        $data = $request->validate([
            'code' => ['sometimes', 'string', 'max:50', Rule::unique('vehicle_types', 'code')->ignore($vehicleType->id)],
            'name' => ['sometimes', 'string', 'max:255', Rule::unique('vehicle_types', 'name')->ignore($vehicleType->id)],
            'category' => ['sometimes', 'nullable', 'string', 'max:100'],
        ]);

        $vehicleType->fill($data);
        $vehicleType->save();

        return response()->json(['vehicle_type' => $vehicleType]);
    }

    public function activate(VehicleType $vehicleType)
    {
        Gate::authorize('update', $vehicleType);

        $vehicleType->forceFill(['is_active' => true])->save();

        return response()->json(['vehicle_type' => $vehicleType->fresh()]);
    }

    public function deactivate(VehicleType $vehicleType)
    {
        Gate::authorize('update', $vehicleType);

        $vehicleType->forceFill(['is_active' => false])->save();

        return response()->json(['vehicle_type' => $vehicleType->fresh()]);
    }
}
