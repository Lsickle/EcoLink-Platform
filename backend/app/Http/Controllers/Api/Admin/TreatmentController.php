<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Concerns\LogsSecurityEvents;
use App\Http\Controllers\Controller;
use App\Models\Treatment;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * Catálogo GLOBAL "Tratamientos" (Incineración, Coprocesamiento, Celda de
 * Seguridad, etc. -- Decreto 4741/2005, compilado en el Decreto 1076 de
 * 2015). Gestionado EXCLUSIVAMENTE por platform staff (ver
 * `TreatmentPolicy::create()`/`update()`), mismo gate binario que
 * `OrganizationController`/`BusinessRoleController`. La LECTURA
 * (`treatments.read`) está disponible para cualquier usuario autenticado con
 * el permiso -- los Gestores lo necesitan para configurar sus
 * `branch_treatments`.
 *
 * `tenant_organization_id` SIEMPRE NULL en store() -- es un catálogo global,
 * no hay tratamientos propios de un tenant en este lote.
 * `parent_treatment_id` NUNCA se expone en el formulario (confirmado por el
 * usuario, no se usa todavía).
 */
class TreatmentController extends Controller
{
    use LogsSecurityEvents;

    private const TREATMENT_TYPES = [
        'DISPOSAL', 'THERMAL', 'CHEMICAL', 'PHYSICOCHEMICAL', 'LIQUID', 'SLUDGE',
        'STABILIZATION', 'BIOLOGICAL', 'RECOVERY', 'PHYSICAL',
    ];

    private const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'];

    public function index(Request $request)
    {
        Gate::authorize('viewAny', Treatment::class);

        $actorTenantId = $request->user()->tenant_organization_id;

        $search = $request->input('search');
        $status = $request->input('status');
        $treatmentType = $request->input('treatment_type');

        $sortableColumns = ['code', 'name', 'treatment_type', 'risk_level', 'is_active', 'created_at'];
        $sort = in_array($request->input('sort'), $sortableColumns, true) ? $request->input('sort') : 'code';
        $direction = strtolower((string) $request->input('direction')) === 'desc' ? 'desc' : 'asc';

        $treatments = Treatment::query()
            ->where(function ($query) use ($actorTenantId) {
                $query->whereNull('tenant_organization_id');

                if ($actorTenantId !== null) {
                    $query->orWhere('tenant_organization_id', $actorTenantId);
                }
            })
            ->when($search, function ($query) use ($search) {
                $query->where(function ($query) use ($search) {
                    $query->where('code', 'ILIKE', "%{$search}%")
                        ->orWhere('name', 'ILIKE', "%{$search}%");
                });
            })
            ->when($status === 'active', fn ($query) => $query->where('is_active', true))
            ->when($status === 'inactive', fn ($query) => $query->where('is_active', false))
            ->when($treatmentType, fn ($query) => $query->where('treatment_type', $treatmentType))
            ->orderBy($sort, $direction)
            ->paginate($request->integer('per_page', 15));

        return response()->json($treatments);
    }

    public function show(Treatment $treatment)
    {
        Gate::authorize('view', $treatment);

        $treatment->load(['createdBy:id,username', 'updatedBy:id,username']);

        return response()->json(['treatment' => $treatment]);
    }

    public function store(Request $request)
    {
        Gate::authorize('create', Treatment::class);

        $data = $request->validate($this->validationRules());

        $treatment = Treatment::query()->create([
            ...$data,
            'tenant_organization_id' => null,
            'parent_treatment_id' => null,
            'is_system' => false,
            'is_active' => true,
            'created_by' => $request->user()->id,
            'updated_by' => $request->user()->id,
        ]);

        $this->logSecurityEvent(
            $request, 'TREATMENT_CREATED', 'SUCCESS',
            "Tratamiento '{$treatment->name}' creado.", $request->user(),
            ['treatment_id' => $treatment->id],
        );

        return response()->json(['treatment' => $treatment], 201);
    }

    public function update(Request $request, Treatment $treatment)
    {
        Gate::authorize('update', $treatment);

        $data = $request->validate($this->validationRules(ignoreTreatmentId: $treatment->id, sometimes: true));

        $treatment->fill($data);
        $treatment->updated_by = $request->user()->id;
        $treatment->save();

        $this->logSecurityEvent(
            $request, 'TREATMENT_UPDATED', 'SUCCESS',
            "Tratamiento '{$treatment->name}' modificado.", $request->user(),
            ['treatment_id' => $treatment->id],
        );

        return response()->json(['treatment' => $treatment]);
    }

    public function activate(Request $request, Treatment $treatment)
    {
        Gate::authorize('update', $treatment);
        abort_unless($request->user()->hasPermission('treatments.activate'), 403, 'No tiene permiso para activar tratamientos.');

        $treatment->forceFill(['is_active' => true, 'updated_by' => $request->user()->id])->save();

        $this->logSecurityEvent(
            $request, 'TREATMENT_ACTIVATED', 'SUCCESS',
            "Tratamiento '{$treatment->name}' activado.", $request->user(),
            ['treatment_id' => $treatment->id],
        );

        return response()->json(['treatment' => $treatment->fresh()]);
    }

    public function deactivate(Request $request, Treatment $treatment)
    {
        Gate::authorize('update', $treatment);
        abort_unless($request->user()->hasPermission('treatments.deactivate'), 403, 'No tiene permiso para inactivar tratamientos.');

        $treatment->forceFill(['is_active' => false, 'updated_by' => $request->user()->id])->save();

        $this->logSecurityEvent(
            $request, 'TREATMENT_DEACTIVATED', 'SUCCESS',
            "Tratamiento '{$treatment->name}' inactivado.", $request->user(),
            ['treatment_id' => $treatment->id],
        );

        return response()->json(['treatment' => $treatment->fresh()]);
    }

    private function validationRules(?int $ignoreTreatmentId = null, bool $sometimes = false): array
    {
        $required = $sometimes ? 'sometimes' : 'required';

        return [
            'code' => [
                $required, 'string', 'max:50',
                Rule::unique('treatments', 'code')->whereNull('deleted_at')->ignore($ignoreTreatmentId),
            ],
            'name' => [$required, 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string'],
            'treatment_type' => ['sometimes', 'string', Rule::in(self::TREATMENT_TYPES)],
            'requires_environmental_license' => ['sometimes', 'boolean'],
            'requires_special_transport' => ['sometimes', 'boolean'],
            'allows_recovery' => ['sometimes', 'boolean'],
            'requires_certificate' => ['sometimes', 'boolean'],
            'requires_weight_control' => ['sometimes', 'boolean'],
            'min_temperature' => ['sometimes', 'nullable', 'numeric'],
            'max_temperature' => ['sometimes', 'nullable', 'numeric', 'gte:min_temperature'],
            'temperature_unit' => ['sometimes', 'string', 'max:10'],
            'risk_level' => ['sometimes', 'string', Rule::in(self::RISK_LEVELS)],
            'estimated_processing_time_hours' => ['sometimes', 'nullable', 'numeric', 'min:0'],
        ];
    }
}
