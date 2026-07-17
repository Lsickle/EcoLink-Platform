<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Concerns\LogsSecurityEvents;
use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\BranchTreatment;
use App\Models\Organization;
use App\Models\SecurityLog;
use App\Models\UnCode;
use App\Models\WasteStream;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Habilitación de Tratamientos por Sede (RN-063, D-R02). Acceso DUAL, mismo
 * patrón exacto que `BranchController`/`VehicleController`: platform staff
 * gestiona TODOS los `branch_treatments`; un admin de tenant (o usuario con
 * `branch_treatments.read` sin ser platform staff) solo los de su propia
 * organización -- ver `BranchTreatment::isAccessibleBy()`/
 * `BranchTreatmentPolicy`.
 *
 * Restricción de negocio confirmada: SOLO organizaciones con business_role
 * GESTOR (`can_treat_waste=true`) pueden tener `branch_treatments` --
 * validado en `store()` vía `Organization::hasCapability('can_treat_waste')`,
 * tanto si el actor es platform staff (elige la organización) como si es
 * admin de tenant (defensa en profundidad -- su propia organización ya
 * debería tener el business_role para que la Policy/gate de UI le muestre la
 * pantalla).
 */
class BranchTreatmentController extends Controller
{
    use LogsSecurityEvents;

    private const BRANCH_TREATMENT_EVENTS = [
        'BRANCH_TREATMENT_CREATED', 'BRANCH_TREATMENT_UPDATED',
        'BRANCH_TREATMENT_ACTIVATED', 'BRANCH_TREATMENT_DEACTIVATED',
    ];

    /**
     * `organization_id` como filtro SOLO tiene efecto para platform staff --
     * mismo criterio que `VehicleController::index()`.
     */
    public function index(Request $request)
    {
        Gate::authorize('viewAny', BranchTreatment::class);
        $actor = $request->user();

        $search = $request->input('search');
        $organizationId = $request->input('organization_id');
        $branchId = $request->input('branch_id');
        $treatmentId = $request->input('treatment_id');
        $operationalStatus = $request->input('operational_status');

        $sortableColumns = ['internal_code', 'operational_name', 'operational_status', 'created_at'];
        $sort = in_array($request->input('sort'), $sortableColumns, true) ? $request->input('sort') : 'created_at';
        $direction = strtolower((string) $request->input('direction')) === 'asc' ? 'asc' : 'desc';

        $branchTreatments = BranchTreatment::query()
            ->when(! $actor->isPlatformStaff(), fn ($query) => $query->where('organization_id', $actor->tenant_organization_id))
            ->when($actor->isPlatformStaff() && $organizationId, fn ($query) => $query->where('organization_id', $organizationId))
            ->when($search, function ($query) use ($search) {
                $query->where(function ($query) use ($search) {
                    $query->where('internal_code', 'ILIKE', "%{$search}%")
                        ->orWhere('operational_name', 'ILIKE', "%{$search}%");
                });
            })
            ->when($branchId, fn ($query) => $query->where('branch_id', $branchId))
            ->when($treatmentId, fn ($query) => $query->where('treatment_id', $treatmentId))
            ->when($operationalStatus, fn ($query) => $query->where('operational_status', $operationalStatus))
            ->with(['organization:id,legal_name', 'branch:id,name', 'treatment:id,code,name'])
            ->orderBy($sort, $direction)
            ->paginate($request->integer('per_page', 15));

        return response()->json([
            ...$branchTreatments->toArray(),
            'kpis' => $this->statusKpis($actor),
        ]);
    }

    /**
     * GET /admin/branch-treatments/available -- exploración para el
     * Generador ("¿qué tratamientos de Gestores existen?"). De SOLO
     * LECTURA, accesible a CUALQUIER usuario autenticado (no solo platform
     * staff/dueño de la organización Gestor) -- el Generador necesita ver
     * los tratamientos de OTRAS organizaciones para poder elegir uno y
     * crear su solicitud de evaluación (ver
     * `WasteTreatmentApprovalController::storeForWaste()`). Expone SOLO
     * campos no sensibles -- nunca licencia ambiental, observaciones u
     * otros datos operativos internos del Gestor. Filtrable por
     * `waste_stream_ids[]`/`un_code_ids[]` para acotar a los tratamientos
     * compatibles con las corrientes ya declaradas del residuo.
     *
     * Nota de implementación: se define como método dedicado (no
     * `mode=available` sobre `index()`) porque su forma de respuesta
     * (campos aplanados, sin paginación) y su autorización (cualquier
     * autenticado, no `branch_treatments.read`) son deliberadamente
     * distintas de `index()` -- mezclarlas en un solo método habría
     * requerido ramificar casi toda su lógica.
     */
    public function available(Request $request)
    {
        $wasteStreamIds = array_values(array_filter((array) $request->input('waste_stream_ids', [])));
        $unCodeIds = array_values(array_filter((array) $request->input('un_code_ids', [])));

        $branchTreatments = BranchTreatment::query()
            ->where('is_active', true)
            ->whereHas('organization', fn ($query) => $query->withCapability('can_treat_waste'))
            ->when($wasteStreamIds !== [], fn ($query) => $query->whereHas(
                'allowedWasteStreams', fn ($query) => $query->whereIn('waste_streams.id', $wasteStreamIds),
            ))
            ->when($unCodeIds !== [], fn ($query) => $query->whereHas(
                'allowedUnCodes', fn ($query) => $query->whereIn('un_codes.id', $unCodeIds),
            ))
            ->with(['organization:id,legal_name', 'branch:id,name', 'treatment:id,code,name'])
            ->get()
            ->map(fn (BranchTreatment $branchTreatment) => [
                'id' => $branchTreatment->id,
                'treatment_name' => $branchTreatment->treatment->name,
                'organization_name' => $branchTreatment->organization->legal_name,
                'branch_name' => $branchTreatment->branch->name,
                'max_capacity' => $branchTreatment->max_capacity,
                'capacity_unit' => $branchTreatment->capacity_unit,
            ])
            ->values();

        return response()->json(['branch_treatments' => $branchTreatments]);
    }

    public function show(Request $request, BranchTreatment $branchTreatment)
    {
        Gate::authorize('view', $branchTreatment);

        $branchTreatment->load([
            'organization:id,legal_name',
            'branch:id,name',
            'treatment',
            'allowedWasteStreams:id,code,name,tipo',
            'allowedUnCodes:id,code,name',
            'createdBy:id,username',
            'updatedBy:id,username',
        ]);

        return response()->json(['branch_treatment' => $branchTreatment]);
    }

    public function store(Request $request)
    {
        Gate::authorize('create', BranchTreatment::class);
        $actor = $request->user();

        // Anti-role-smuggling (mismo criterio que
        // VehicleController::store()): un tenant admin SIEMPRE crea en SU
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

        $this->assertBranchBelongsToOrganization($data['branch_id'], $organizationId);
        $this->assertOrganizationCanTreatWaste($organizationId);

        $data['operational_status'] = 'ACTIVE';
        $data['is_active'] = true;
        $data['created_by'] = $actor->id;
        $data['updated_by'] = $actor->id;

        try {
            $branchTreatment = BranchTreatment::query()->create($data);
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages([
                'internal_code' => ['Ya existe un tratamiento de sede con este código interno.'],
            ]);
        }

        $this->logSecurityEvent(
            $request, 'BRANCH_TREATMENT_CREATED', 'SUCCESS',
            "Tratamiento de sede '{$branchTreatment->id}' creado.", $actor,
            ['branch_treatment_id' => $branchTreatment->id, 'organization_id' => $branchTreatment->organization_id],
        );

        return response()->json(['branch_treatment' => $branchTreatment->fresh(['organization:id,legal_name', 'branch:id,name', 'treatment'])], 201);
    }

    /**
     * `organization_id` NO editable tras creación -- mismo criterio que
     * `Branch`/`Vehicle`. `branch_id` SÍ es editable, pero se revalida que
     * siga perteneciendo a la organización del registro.
     */
    public function update(Request $request, BranchTreatment $branchTreatment)
    {
        Gate::authorize('update', $branchTreatment);
        $actor = $request->user();

        $rules = $this->validationRules(sometimes: true);
        $data = $request->validate($rules);
        unset($data['organization_id']);

        if (array_key_exists('branch_id', $data)) {
            $this->assertBranchBelongsToOrganization($data['branch_id'], $branchTreatment->organization_id);
        }

        unset($data['operational_status'], $data['is_active']);

        $branchTreatment->fill($data);
        $branchTreatment->updated_by = $actor->id;

        try {
            $branchTreatment->save();
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages([
                'internal_code' => ['Ya existe un tratamiento de sede con este código interno.'],
            ]);
        }

        $this->logSecurityEvent(
            $request, 'BRANCH_TREATMENT_UPDATED', 'SUCCESS',
            "Tratamiento de sede '{$branchTreatment->id}' modificado.", $actor,
            ['branch_treatment_id' => $branchTreatment->id, 'organization_id' => $branchTreatment->organization_id],
        );

        return response()->json(['branch_treatment' => $branchTreatment->fresh(['organization:id,legal_name', 'branch:id,name', 'treatment'])]);
    }

    public function activate(Request $request, BranchTreatment $branchTreatment)
    {
        Gate::authorize('update', $branchTreatment);
        abort_unless($request->user()->hasPermission('branch_treatments.activate'), 403, 'No tiene permiso para activar tratamientos de sede.');

        $branchTreatment->forceFill(['operational_status' => 'ACTIVE', 'is_active' => true, 'updated_by' => $request->user()->id])->save();

        $this->logSecurityEvent(
            $request, 'BRANCH_TREATMENT_ACTIVATED', 'SUCCESS',
            "Tratamiento de sede '{$branchTreatment->id}' activado.", $request->user(),
            ['branch_treatment_id' => $branchTreatment->id, 'organization_id' => $branchTreatment->organization_id],
        );

        return response()->json(['branch_treatment' => $branchTreatment->fresh()]);
    }

    public function deactivate(Request $request, BranchTreatment $branchTreatment)
    {
        Gate::authorize('update', $branchTreatment);
        abort_unless($request->user()->hasPermission('branch_treatments.deactivate'), 403, 'No tiene permiso para inactivar tratamientos de sede.');

        $branchTreatment->forceFill(['operational_status' => 'INACTIVE', 'is_active' => false, 'updated_by' => $request->user()->id])->save();

        $this->logSecurityEvent(
            $request, 'BRANCH_TREATMENT_DEACTIVATED', 'SUCCESS',
            "Tratamiento de sede '{$branchTreatment->id}' inactivado.", $request->user(),
            ['branch_treatment_id' => $branchTreatment->id, 'organization_id' => $branchTreatment->organization_id],
        );

        return response()->json(['branch_treatment' => $branchTreatment->fresh()]);
    }

    /**
     * Reemplaza la pivote COMPLETA de corrientes Y/A permitidas (selección
     * múltiple tipo checklist, no asignación/revocación individual con
     * historial de auditoría por ítem) -- RN-063/D-R02.
     */
    public function syncAllowedWasteStreams(Request $request, BranchTreatment $branchTreatment)
    {
        Gate::authorize('update', $branchTreatment);

        $data = $request->validate([
            'waste_stream_ids' => ['present', 'array'],
            'waste_stream_ids.*' => [
                'integer', 'distinct',
                Rule::exists('waste_streams', 'id')->where('is_active', true)->whereNull('deleted_at'),
            ],
        ]);

        $this->assertWasteStreamsAccessibleBy($data['waste_stream_ids'], $request->user());

        $syncData = collect($data['waste_stream_ids'])
            ->mapWithKeys(fn ($id) => [$id => ['created_by' => $request->user()->id]])
            ->all();

        $branchTreatment->allowedWasteStreams()->sync($syncData);

        return response()->json(['branch_treatment' => $branchTreatment->fresh('allowedWasteStreams:id,code,name,tipo')]);
    }

    /**
     * Mismo patrón exacto que syncAllowedWasteStreams(), eje Códigos UN.
     */
    public function syncAllowedUnCodes(Request $request, BranchTreatment $branchTreatment)
    {
        Gate::authorize('update', $branchTreatment);

        $data = $request->validate([
            'un_code_ids' => ['present', 'array'],
            'un_code_ids.*' => [
                'integer', 'distinct',
                Rule::exists('un_codes', 'id')->where('is_active', true)->whereNull('deleted_at'),
            ],
        ]);

        $this->assertUnCodesAccessibleBy($data['un_code_ids'], $request->user());

        $syncData = collect($data['un_code_ids'])
            ->mapWithKeys(fn ($id) => [$id => ['created_by' => $request->user()->id]])
            ->all();

        $branchTreatment->allowedUnCodes()->sync($syncData);

        return response()->json(['branch_treatment' => $branchTreatment->fresh('allowedUnCodes:id,code,name')]);
    }

    /**
     * Tab "Actividad" -- mismo patrón que `VehicleController::activity()`.
     */
    public function activity(Request $request, BranchTreatment $branchTreatment)
    {
        abort_unless($request->user()->hasPermission('audit.read'), 403, 'No tiene permiso para consultar la auditoría de tratamientos de sede.');
        abort_unless($branchTreatment->isAccessibleBy($request->user()), 403, 'No tiene acceso a este tratamiento de sede.');

        $logs = SecurityLog::query()
            ->whereIn('event_type', self::BRANCH_TREATMENT_EVENTS)
            ->where('metadata->branch_treatment_id', $branchTreatment->id)
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

    private function statusKpis($actor): array
    {
        $base = BranchTreatment::query()->when(
            ! $actor->isPlatformStaff(),
            fn ($query) => $query->where('organization_id', $actor->tenant_organization_id),
        );

        return [
            'total' => (clone $base)->count(),
            'active' => (clone $base)->where('is_active', true)->count(),
            'inactive' => (clone $base)->where('is_active', false)->count(),
        ];
    }

    private function validationRules(bool $sometimes = false): array
    {
        $required = $sometimes ? 'sometimes' : 'required';

        return [
            'branch_id' => [$required, 'integer', 'exists:branches,id'],
            'treatment_id' => [
                $required, 'integer',
                Rule::exists('treatments', 'id')->where('is_active', true)->whereNull('deleted_at'),
            ],
            'internal_code' => ['sometimes', 'nullable', 'string', 'max:50'],
            'operational_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'max_capacity' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'capacity_unit' => ['sometimes', 'string', 'max:20'],
            'daily_capacity' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'monthly_capacity' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'environmental_license_number' => ['sometimes', 'nullable', 'string', 'max:100'],
            'valid_from' => ['sometimes', 'nullable', 'date'],
            'valid_until' => ['sometimes', 'nullable', 'date', 'after_or_equal:valid_from'],
            'requires_manual_approval' => ['sometimes', 'boolean'],
            'allows_mixed_waste' => ['sometimes', 'boolean'],
            'requires_weight_validation' => ['sometimes', 'boolean'],
            'observations' => ['sometimes', 'nullable', 'string'],
        ];
    }

    /**
     * Mismo helper conceptual que `VehicleController::assertBranchBelongsToOrganization()`.
     */
    private function assertBranchBelongsToOrganization(int $branchId, ?int $organizationId): void
    {
        $branch = Branch::withTrashed()->find($branchId);

        if ($branch && (int) $branch->organization_id !== (int) $organizationId) {
            throw ValidationException::withMessages([
                'branch_id' => ['La sede indicada no pertenece a la organización del tratamiento.'],
            ]);
        }
    }

    /**
     * RN-063/plan de este lote: solo organizaciones con business_role GESTOR
     * (`can_treat_waste=true`, vínculo activo en `organization_business_roles`)
     * pueden tener `branch_treatments` -- defensa en profundidad, tanto para
     * platform staff (elige libremente la organización) como para un admin
     * de tenant (su propia organización ya debería cumplir esto para que la
     * UI le muestre la pantalla, pero se revalida aquí igual).
     */
    private function assertOrganizationCanTreatWaste(?int $organizationId): void
    {
        $organization = Organization::query()->find($organizationId);

        if (! $organization || ! $organization->hasCapability('can_treat_waste')) {
            throw ValidationException::withMessages([
                'organization_id' => ['La organización no tiene el tipo de negocio Gestor, no puede habilitar tratamientos.'],
            ]);
        }
    }

    /**
     * Hallazgo de seguridad (IDOR, especialista-seguridad): a diferencia de
     * `Treatment` (siempre global), `WasteStream` admite registros privados
     * por tenant -- la regla `exists` de la validación NO verifica
     * accesibilidad, solo existencia. Sin este chequeo, un admin de tenant A
     * podría sincronizar (adivinando/enumerando IDs) una corriente privada
     * del tenant B, quedando resuelta en la respuesta y persistida como
     * "permitida" en su configuración operativa.
     */
    private function assertWasteStreamsAccessibleBy(array $wasteStreamIds, $actor): void
    {
        $accessibleCount = WasteStream::query()
            ->whereKey($wasteStreamIds)
            ->get()
            ->filter(fn (WasteStream $wasteStream) => $wasteStream->isAccessibleBy($actor))
            ->count();

        if ($accessibleCount !== count($wasteStreamIds)) {
            throw ValidationException::withMessages([
                'waste_stream_ids' => ['Una o más corrientes indicadas no son accesibles.'],
            ]);
        }
    }

    /**
     * Mismo criterio que assertWasteStreamsAccessibleBy(), eje Códigos UN.
     */
    private function assertUnCodesAccessibleBy(array $unCodeIds, $actor): void
    {
        $accessibleCount = UnCode::query()
            ->whereKey($unCodeIds)
            ->get()
            ->filter(fn (UnCode $unCode) => $unCode->isAccessibleBy($actor))
            ->count();

        if ($accessibleCount !== count($unCodeIds)) {
            throw ValidationException::withMessages([
                'un_code_ids' => ['Uno o más códigos UN indicados no son accesibles.'],
            ]);
        }
    }
}
