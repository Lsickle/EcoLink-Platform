<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Concerns\LogsSecurityEvents;
use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\SecurityLog;
use App\Models\Vehicle;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * CRUD de Vehículos (RN-VEH-001 a RN-VEH-008, CU-051.1/.2/.3/.4). Acceso
 * DUAL, mismo patrón exacto que `BranchController`: platform staff gestiona
 * TODOS los vehículos de CUALQUIER organización; un admin de tenant o un
 * usuario con rol LOGÍSTICA (solo lectura, `vehicles.read`) gestiona SOLO
 * los de su propia organización -- ver `Vehicle::isAccessibleBy()`/
 * `VehiclePolicy`.
 *
 * Sin restricción de business_role para poseer vehículos (decisión ya
 * confirmada, desviación deliberada de RN-090 tal como está escrita hoy):
 * cualquier organización puede tener vehículos.
 */
class VehicleController extends Controller
{
    use LogsSecurityEvents;

    private const OPERATIONAL_STATUSES = ['ACTIVE', 'OUT_OF_SERVICE', 'MAINTENANCE'];

    private const VEHICLE_EVENTS = ['VEHICLE_CREATED', 'VEHICLE_UPDATED', 'VEHICLE_ACTIVATED', 'VEHICLE_DEACTIVATED'];

    /**
     * `organization_id` como filtro SOLO tiene efecto para platform staff --
     * un tenant admin (o LOGÍSTICA) ya está acotado a la suya, el parámetro
     * se ignora si lo manda.
     */
    public function index(Request $request)
    {
        Gate::authorize('viewAny', Vehicle::class);
        $actor = $request->user();

        $search = $request->input('search');
        $organizationId = $request->input('organization_id');
        $vehicleTypeId = $request->input('vehicle_type_id');
        $operationalStatus = $request->input('operational_status');

        $sortableColumns = ['plate_number', 'code', 'brand', 'model', 'operational_status', 'created_at'];
        $sort = in_array($request->input('sort'), $sortableColumns, true) ? $request->input('sort') : 'plate_number';
        $direction = strtolower((string) $request->input('direction')) === 'desc' ? 'desc' : 'asc';

        $vehicles = Vehicle::query()
            ->when(! $actor->isPlatformStaff(), fn ($query) => $query->where('organization_id', $actor->tenant_organization_id))
            ->when($actor->isPlatformStaff() && $organizationId, fn ($query) => $query->where('organization_id', $organizationId))
            ->when($search, function ($query) use ($search) {
                $query->where(function ($query) use ($search) {
                    $query->where('plate_number', 'ILIKE', "%{$search}%")
                        ->orWhere('code', 'ILIKE', "%{$search}%")
                        ->orWhere('brand', 'ILIKE', "%{$search}%")
                        ->orWhere('model', 'ILIKE', "%{$search}%");
                });
            })
            ->when($vehicleTypeId, fn ($query) => $query->where('vehicle_type_id', $vehicleTypeId))
            ->when($operationalStatus, fn ($query) => $query->where('operational_status', $operationalStatus))
            ->when($request->has('supports_hazmat'), fn ($query) => $query->where('supports_hazmat', $request->boolean('supports_hazmat')))
            ->when($request->has('has_gps'), fn ($query) => $query->where('has_gps', $request->boolean('has_gps')))
            // Eager-carga obligatoria (lección de un bug reciente en
            // BranchController::index(): sin esto, el frontend muestra "—"
            // siempre en organización/tipo de vehículo).
            ->with(['organization:id,legal_name', 'vehicleType:id,name'])
            ->orderBy($sort, $direction)
            ->paginate($request->integer('per_page', 15));

        return response()->json([
            ...$vehicles->toArray(),
            'kpis' => $this->statusKpis($actor),
        ]);
    }

    public function show(Request $request, Vehicle $vehicle)
    {
        Gate::authorize('view', $vehicle);

        $vehicle->load([
            'organization:id,legal_name',
            'branch:id,name',
            'vehicleType',
            'createdBy:id,username',
            'updatedBy:id,username',
        ]);

        return response()->json(['vehicle' => $vehicle]);
    }

    public function store(Request $request)
    {
        Gate::authorize('create', Vehicle::class);
        $actor = $request->user();

        // Anti-role-smuggling (mismo criterio que
        // BranchController::store()): un tenant admin SIEMPRE crea en SU
        // propia organización, sin importar lo que venga en el payload.
        $organizationId = $actor->isPlatformStaff()
            ? $request->integer('organization_id')
            : $actor->tenant_organization_id;

        $rules = $this->validationRules();

        if ($actor->isPlatformStaff()) {
            $rules['organization_id'] = ['required', 'integer', 'exists:organizations,id'];
        }

        $data = $request->validate($rules);
        $data['organization_id'] = $organizationId;

        if (! empty($data['branch_id'])) {
            $this->assertBranchBelongsToOrganization($data['branch_id'], $organizationId);
        }

        // RN-VEH-005: el estado operativo inicial SIEMPRE es 'ACTIVE', y
        // `is_active` siempre nace en true -- ambos ignoran cualquier valor
        // que el cliente intente enviar en creación (hallazgo Medio,
        // especialista-seguridad 2026-07-16: antes `is_active` aceptaba el
        // valor del payload, permitiendo crear un vehículo ya inactivo pese
        // a que operational_status quedaba forzado en ACTIVE).
        $data['operational_status'] = 'ACTIVE';
        $data['is_active'] = true;
        $data['created_by'] = $actor->id;
        $data['updated_by'] = $actor->id;

        // Mismo patrón que Organización/Sede: ventana residual de carrera
        // sobre los índices únicos parciales de placa/VIN/código.
        try {
            $vehicle = Vehicle::query()->create($data);
        } catch (UniqueConstraintViolationException $exception) {
            throw ValidationException::withMessages($this->messagesForUniqueViolation($exception));
        }

        $this->logSecurityEvent(
            $request, 'VEHICLE_CREATED', 'SUCCESS',
            "Vehículo '{$vehicle->plate_number}' creado.", $actor,
            ['vehicle_id' => $vehicle->id, 'organization_id' => $vehicle->organization_id],
        );

        return response()->json(['vehicle' => $vehicle->fresh(['organization:id,legal_name', 'vehicleType:id,name'])], 201);
    }

    /**
     * `organization_id` NO editable tras creación -- mismo criterio que
     * `Branch`/`Organization`.
     */
    public function update(Request $request, Vehicle $vehicle)
    {
        Gate::authorize('update', $vehicle);
        $actor = $request->user();

        $rules = $this->validationRules(ignoreVehicleId: $vehicle->id, sometimes: true);
        $data = $request->validate($rules);
        unset($data['organization_id']);

        if (array_key_exists('branch_id', $data) && $data['branch_id'] !== null) {
            $this->assertBranchBelongsToOrganization($data['branch_id'], $vehicle->organization_id);
        }

        // El estado operativo Y is_active se gestionan vía
        // activate()/deactivate(), no vía update() -- mismo criterio
        // granular que `branches.activate`/`.deactivate` frente a
        // `branches.update` (hallazgo Medio, especialista-seguridad
        // 2026-07-16: `is_active` no estaba excluido aquí, permitiendo a
        // cualquier actor con `vehicles.update` togglearlo sin tener
        // `vehicles.activate`/`.deactivate`).
        unset($data['operational_status'], $data['is_active']);

        $vehicle->fill($data);
        $vehicle->updated_by = $actor->id;

        try {
            $vehicle->save();
        } catch (UniqueConstraintViolationException $exception) {
            throw ValidationException::withMessages($this->messagesForUniqueViolation($exception));
        }

        $this->logSecurityEvent(
            $request, 'VEHICLE_UPDATED', 'SUCCESS',
            "Vehículo '{$vehicle->plate_number}' modificado.", $actor,
            ['vehicle_id' => $vehicle->id, 'organization_id' => $vehicle->organization_id],
        );

        return response()->json(['vehicle' => $vehicle->fresh(['organization:id,legal_name', 'vehicleType:id,name'])]);
    }

    /**
     * `update` autoriza el acceso a ESTE vehículo; `vehicles.activate` es el
     * permiso ESPECÍFICO que gobierna la acción -- mismo criterio granular
     * ya usado en `branches.activate`/`.deactivate`. `operational_status`
     * pasa a 'ACTIVE' junto con `is_active=true` (decisión propia de este
     * lote, sin wireframe exacto que seguir: CU-051.4 solo confirma
     * "Activo"/"Fuera de Servicio" como los 2 estados visibles).
     */
    public function activate(Request $request, Vehicle $vehicle)
    {
        Gate::authorize('update', $vehicle);
        abort_unless($request->user()->hasPermission('vehicles.activate'), 403, 'No tiene permiso para activar vehículos.');

        $vehicle->forceFill(['operational_status' => 'ACTIVE', 'is_active' => true, 'updated_by' => $request->user()->id])->save();

        $this->logSecurityEvent(
            $request, 'VEHICLE_ACTIVATED', 'SUCCESS',
            "Vehículo '{$vehicle->plate_number}' activado.", $request->user(),
            ['vehicle_id' => $vehicle->id, 'organization_id' => $vehicle->organization_id],
        );

        return response()->json(['vehicle' => $vehicle->fresh()]);
    }

    /**
     * `operational_status` pasa a 'OUT_OF_SERVICE' (no un valor genérico
     * 'INACTIVE') -- decisión propia de este lote, inspirada en el
     * wireframe de CU-051.4 ("Fuera de Servicio"), sin confirmación
     * explícita del negocio.
     */
    public function deactivate(Request $request, Vehicle $vehicle)
    {
        Gate::authorize('update', $vehicle);
        abort_unless($request->user()->hasPermission('vehicles.deactivate'), 403, 'No tiene permiso para inactivar vehículos.');

        $vehicle->forceFill(['operational_status' => 'OUT_OF_SERVICE', 'is_active' => false, 'updated_by' => $request->user()->id])->save();

        $this->logSecurityEvent(
            $request, 'VEHICLE_DEACTIVATED', 'SUCCESS',
            "Vehículo '{$vehicle->plate_number}' inactivado.", $request->user(),
            ['vehicle_id' => $vehicle->id, 'organization_id' => $vehicle->organization_id],
        );

        return response()->json(['vehicle' => $vehicle->fresh()]);
    }

    /**
     * Tab "Actividad" -- mismo patrón que `BranchController::activity()`:
     * exige `audit.read` Y que el vehículo sea accesible por el actor.
     */
    public function activity(Request $request, Vehicle $vehicle)
    {
        abort_unless($request->user()->hasPermission('audit.read'), 403, 'No tiene permiso para consultar la auditoría de vehículos.');
        abort_unless($vehicle->isAccessibleBy($request->user()), 403, 'No tiene acceso a este vehículo.');

        $logs = SecurityLog::query()
            ->whereIn('event_type', self::VEHICLE_EVENTS)
            ->where('metadata->vehicle_id', $vehicle->id)
            ->with('user:id,username')
            ->orderByDesc('occurred_at')
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 15));

        $logs->getCollection()->transform(fn ($log) => [
            'event_type' => $log->event_type,
            'description' => $log->description,
            'actor' => $log->user,
            'created_at' => $log->occurred_at,
        ]);

        return response()->json($logs);
    }

    /**
     * KPIs del listado por `is_active` (no `operational_status`) -- mismo
     * criterio que `Branch::statusKpis()`, con la MISMA visibilidad que
     * `index()`.
     */
    private function statusKpis($actor): array
    {
        $base = Vehicle::query()->when(
            ! $actor->isPlatformStaff(),
            fn ($query) => $query->where('organization_id', $actor->tenant_organization_id),
        );

        return [
            'total' => (clone $base)->count(),
            'active' => (clone $base)->where('is_active', true)->count(),
            'inactive' => (clone $base)->where('is_active', false)->count(),
        ];
    }

    /**
     * `organization_id`/`operational_status` se manejan aparte (ver
     * store()/update()/activate()/deactivate()) -- este set cubre el resto
     * del formulario. `plate_number`/`vin`/`code` únicos en BD (índices
     * parciales, excluyen soft-deletes), validados aquí también para
     * devolver un 422 legible en el camino feliz (la excepción de BD sigue
     * siendo la red de seguridad final contra condiciones de carrera).
     */
    private function validationRules(?int $ignoreVehicleId = null, bool $sometimes = false): array
    {
        $required = $sometimes ? 'sometimes' : 'required';

        return [
            'branch_id' => ['sometimes', 'nullable', 'integer', 'exists:branches,id'],
            'code' => [
                'sometimes', 'nullable', 'string', 'max:50',
                Rule::unique('vehicles', 'code')->whereNull('deleted_at')->ignore($ignoreVehicleId),
            ],
            'plate_number' => [
                $required, 'string', 'max:20',
                Rule::unique('vehicles', 'plate_number')->whereNull('deleted_at')->ignore($ignoreVehicleId),
            ],
            'vin' => [
                'sometimes', 'nullable', 'string', 'max:100',
                Rule::unique('vehicles', 'vin')->whereNull('deleted_at')->ignore($ignoreVehicleId),
            ],
            'vehicle_type_id' => [$required, 'integer', 'exists:vehicle_types,id'],
            'brand' => ['sometimes', 'nullable', 'string', 'max:100'],
            'model' => ['sometimes', 'nullable', 'string', 'max:100'],
            'manufacturing_year' => ['sometimes', 'nullable', 'integer', 'digits:4'],
            // RN-VEH-008: capacidad de carga > 0 si se registra.
            'max_load_capacity' => ['sometimes', 'nullable', 'numeric', 'min:0.01'],
            'capacity_unit' => ['sometimes', 'string', 'max:20'],
            'supports_hazmat' => ['sometimes', 'boolean'],
            'has_gps' => ['sometimes', 'boolean'],
            'soat_expiration_date' => ['sometimes', 'nullable', 'date'],
            'technical_inspection_expiration' => ['sometimes', 'nullable', 'date'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * Mismo helper conceptual que `BranchController` necesitaría si
     * `Branch` tuviera `branch_id` -- valida que la sede enviada pertenezca
     * a la organización del vehículo. Usa `withTrashed()` (hallazgo Bajo,
     * especialista-seguridad 2026-07-16): `exists:branches,id` en las
     * reglas de validación no respeta soft-delete, así que un `branch_id`
     * soft-eliminado de OTRA organización pasaba esa regla pero
     * `Branch::query()->find()` (con el scope global de SoftDeletes)
     * devolvía null, omitiendo silenciosamente el chequeo de "misma
     * organización" en vez de rechazarlo.
     */
    private function assertBranchBelongsToOrganization(int $branchId, ?int $organizationId): void
    {
        $branch = Branch::withTrashed()->find($branchId);

        if ($branch && (int) $branch->organization_id !== (int) $organizationId) {
            throw ValidationException::withMessages([
                'branch_id' => ['La sucursal indicada no pertenece a la organización del vehículo.'],
            ]);
        }
    }

    /**
     * Traduce la violación de índice único parcial (placa/VIN/código) a un
     * mensaje 422 legible -- mismo patrón ya usado en Organización/Sede.
     * Inspecciona el mensaje de la excepción de Postgres para identificar
     * qué índice fue el que chocó (no hay forma estructurada de saberlo por
     * `UniqueConstraintViolationException` en Laravel).
     */
    private function messagesForUniqueViolation(UniqueConstraintViolationException $exception): array
    {
        $message = $exception->getMessage();

        if (str_contains($message, 'vehicles_plate_number_unique')) {
            return ['plate_number' => ['Ya existe un vehículo con esta placa.']];
        }

        if (str_contains($message, 'vehicles_vin_unique')) {
            return ['vin' => ['Ya existe un vehículo con este VIN.']];
        }

        if (str_contains($message, 'vehicles_code_unique')) {
            return ['code' => ['Ya existe un vehículo con este código.']];
        }

        return ['plate_number' => ['Ya existe un vehículo con estos datos.']];
    }
}
