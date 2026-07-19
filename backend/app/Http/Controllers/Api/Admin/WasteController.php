<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Concerns\LogsSecurityEvents;
use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\File;
use App\Models\MeasurementUnit;
use App\Models\SecurityLog;
use App\Models\UnCode;
use App\Models\Waste;
use App\Models\WasteOperationalStatus;
use App\Models\WasteStream;
use App\Models\WasteType;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Núcleo del Módulo Residuos (declaración + clasificación). Acceso DUAL,
 * mismo patrón exacto que `VehicleController`/`BranchTreatmentController`:
 * platform staff gestiona TODOS los residuos; un admin de tenant (o usuario
 * con `wastes.read`) solo los de su propia organización -- ver
 * `Waste::isAccessibleBy()`/`WastePolicy`. SIN restricción de business_role
 * (confirmado por el usuario: "cualquier rol de negocio puede registrar
 * residuos").
 *
 * Workflow de declaración (`wastes.status`, SIN motor de workflow
 * configurable, confirmado por el usuario): BR (Borrador, inicial) -> DEC
 * (Declarado) -> REV (En Revisión) -> CLS (Clasificado); RCH (Rechazado,
 * reversible a BR desde DEC o REV). Endpoints dedicados
 * (submit/startReview/classify/reject), cada uno gateado por su PROPIO
 * permiso (`wastes.submit`/`.review`/`.classify`/`.reject`) -- a diferencia
 * de activate()/deactivate() (que SÍ siguen el patrón doble-permiso ya
 * establecido: `Gate::authorize('update', ...)` + el permiso específico).
 */
class WasteController extends Controller
{
    use LogsSecurityEvents;

    private const WASTE_EVENTS = [
        'WASTE_CREATED', 'WASTE_UPDATED', 'WASTE_ACTIVATED', 'WASTE_DEACTIVATED',
        'WASTE_SUBMITTED', 'WASTE_REVIEW_STARTED', 'WASTE_CLASSIFIED', 'WASTE_REJECTED',
    ];

    /**
     * `organization_id` como filtro SOLO tiene efecto para platform staff --
     * mismo criterio que `VehicleController::index()`.
     */
    public function index(Request $request)
    {
        Gate::authorize('viewAny', Waste::class);
        $actor = $request->user();

        $search = $request->input('search');
        $organizationId = $request->input('organization_id');
        $branchId = $request->input('branch_id');
        $wasteCategoryId = $request->input('waste_category_id');
        $status = $request->input('status');
        $operationalStatusId = $request->input('operational_status_id');
        $withViableTreatment = $request->boolean('with_viable_treatment');

        $sortableColumns = ['name', 'code', 'status', 'created_at'];
        $sort = in_array($request->input('sort'), $sortableColumns, true) ? $request->input('sort') : 'created_at';
        $direction = strtolower((string) $request->input('direction')) === 'asc' ? 'asc' : 'desc';

        $wastes = Waste::query()
            ->when(! $actor->isPlatformStaff(), fn ($query) => $query->where('organization_id', $actor->tenant_organization_id))
            ->when($actor->isPlatformStaff() && $organizationId, fn ($query) => $query->where('organization_id', $organizationId))
            ->when($search, function ($query) use ($search) {
                $query->where(function ($query) use ($search) {
                    $query->where('name', 'ILIKE', "%{$search}%")
                        ->orWhere('code', 'ILIKE', "%{$search}%");
                });
            })
            ->when($branchId, fn ($query) => $query->where('branch_id', $branchId))
            ->when($wasteCategoryId, fn ($query) => $query->where('waste_category_id', $wasteCategoryId))
            ->when($status, fn ($query) => $query->where('status', $status))
            ->when($operationalStatusId, fn ($query) => $query->where('operational_status_id', $operationalStatusId))
            // Gap de contrato (frontend, wizard de Solicitudes de Servicio,
            // Paso 2): scopeWithViableTreatment() ya existía en el modelo
            // pero nunca se exponía como filtro -- forzaba un workaround
            // N+1 en el cliente. Filtro ADITIVO, no reemplaza el scoping de
            // organización de arriba.
            ->when($withViableTreatment, fn ($query) => $query->withViableTreatment())
            ->with(['organization:id,legal_name', 'branch:id,name', 'wasteCategory:id,code,name'])
            ->orderBy($sort, $direction)
            ->paginate($request->integer('per_page', 15));

        return response()->json([
            ...$wastes->toArray(),
            'kpis' => $this->statusKpis($actor),
        ]);
    }

    public function show(Request $request, Waste $waste)
    {
        Gate::authorize('view', $waste);

        $waste->load([
            'organization:id,legal_name',
            'branch:id,name',
            'wasteCategory',
            'wasteType',
            'physicalState',
            'measurementUnit',
            'generationFrequency',
            'operationalStatus',
            'wasteStreamAssignments.wasteStream',
            'wasteUnCodes.unCode',
            'wasteHazardCharacteristics.hazardCharacteristic',
            'createdBy:id,username',
            'updatedBy:id,username',
        ]);

        // Waste::hasViableTreatment() ya existía como método del modelo
        // (lote de Evaluación del Gestor), pero nunca se exponía en la
        // respuesta JSON -- el frontend necesita este booleano para el
        // badge "Tratamiento Viable" sin duplicar la regla de negocio en el
        // cliente. Se fija explícitamente aquí (no vía $appends/accessor en
        // el modelo) porque no hay un patrón ya establecido en el proyecto
        // para exponer un método de dominio como campo derivado, y esto
        // evita que Waste::toArray() lo calcule (consulta adicional) en
        // contextos donde no se necesita (ej. index()).
        $waste->has_viable_treatment = $waste->hasViableTreatment();

        return response()->json(['waste' => $waste]);
    }

    public function store(Request $request)
    {
        Gate::authorize('create', Waste::class);
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

        if (! empty($data['branch_id'])) {
            $this->assertBranchBelongsToOrganization($data['branch_id'], $organizationId);
        }

        // Defaults a nivel de aplicación (esquema-bd: FK NOT NULL sin
        // default de esquema posible) -- OPERATIONAL/KG/ACTIVE.
        $data['waste_type_id'] ??= $this->defaultCatalogId(WasteType::class, 'OPERATIONAL');
        $data['measurement_unit_id'] ??= $this->defaultCatalogId(MeasurementUnit::class, 'KG');
        $data['operational_status_id'] ??= $this->defaultCatalogId(WasteOperationalStatus::class, 'ACTIVE');

        // `waste_danger`/`status`/`last_classification_review_at` NUNCA se
        // aceptan del cliente -- ver docblock de Waste. `is_active` siempre
        // nace en true, `is_template`/`is_preapproved`/
        // `preapproved_by_organization_id` quedan en su default de esquema
        // (false/false/NULL) salvo que el cliente los envíe explícitamente
        // (is_template sí es editable por el usuario, preapproved_* NO --
        // ver alcance de este lote).
        unset($data['preapproved_by_organization_id']);
        $data['is_active'] = true;
        $data['created_by'] = $actor->id;
        $data['updated_by'] = $actor->id;

        try {
            $waste = Waste::query()->create($data);
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages([
                'code' => ['Ya existe un residuo con este código en la organización.'],
            ]);
        }

        $this->logSecurityEvent(
            $request, 'WASTE_CREATED', 'SUCCESS',
            "Residuo '{$waste->name}' creado.", $actor,
            ['waste_id' => $waste->id, 'organization_id' => $waste->organization_id],
        );

        return response()->json(['waste' => $waste->fresh(['organization:id,legal_name', 'wasteType', 'measurementUnit', 'operationalStatus'])], 201);
    }

    /**
     * `organization_id` NO editable tras creación -- mismo criterio que
     * `Branch`/`Vehicle`/`BranchTreatment`.
     */
    public function update(Request $request, Waste $waste)
    {
        Gate::authorize('update', $waste);
        $actor = $request->user();

        $rules = $this->validationRules(sometimes: true);
        $data = $request->validate($rules);
        unset($data['organization_id'], $data['preapproved_by_organization_id']);

        if (array_key_exists('branch_id', $data) && $data['branch_id'] !== null) {
            $this->assertBranchBelongsToOrganization($data['branch_id'], $waste->organization_id);
        }

        // El estado operativo (is_active) se gestiona vía
        // activate()/deactivate(); el workflow de declaración (status) vía
        // submit()/startReview()/classify()/reject() -- ninguno editable
        // aquí, mismo criterio granular que el resto del proyecto.
        unset($data['is_active']);

        $waste->fill($data);
        $waste->updated_by = $actor->id;

        try {
            $waste->save();
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages([
                'code' => ['Ya existe un residuo con este código en la organización.'],
            ]);
        }

        $this->logSecurityEvent(
            $request, 'WASTE_UPDATED', 'SUCCESS',
            "Residuo '{$waste->name}' modificado.", $actor,
            ['waste_id' => $waste->id, 'organization_id' => $waste->organization_id],
        );

        return response()->json(['waste' => $waste->fresh(['organization:id,legal_name', 'wasteType', 'measurementUnit', 'operationalStatus'])]);
    }

    public function activate(Request $request, Waste $waste)
    {
        Gate::authorize('update', $waste);
        abort_unless($request->user()->hasPermission('wastes.activate'), 403, 'No tiene permiso para activar residuos.');

        $waste->forceFill(['is_active' => true, 'updated_by' => $request->user()->id])->save();

        $this->logSecurityEvent(
            $request, 'WASTE_ACTIVATED', 'SUCCESS',
            "Residuo '{$waste->name}' activado.", $request->user(),
            ['waste_id' => $waste->id, 'organization_id' => $waste->organization_id],
        );

        return response()->json(['waste' => $waste->fresh()]);
    }

    public function deactivate(Request $request, Waste $waste)
    {
        Gate::authorize('update', $waste);
        abort_unless($request->user()->hasPermission('wastes.deactivate'), 403, 'No tiene permiso para inactivar residuos.');

        $waste->forceFill(['is_active' => false, 'updated_by' => $request->user()->id])->save();

        $this->logSecurityEvent(
            $request, 'WASTE_DEACTIVATED', 'SUCCESS',
            "Residuo '{$waste->name}' inactivado.", $request->user(),
            ['waste_id' => $waste->id, 'organization_id' => $waste->organization_id],
        );

        return response()->json(['waste' => $waste->fresh()]);
    }

    /**
     * BR -> DEC. Valida que tenga al menos 1 corriente Y/A o código UN
     * asignado, y los campos requeridos del wizard completos -- regla de
     * aplicación (no constraint de columna), ver docblock de la migración de
     * `wastes`.
     */
    public function submit(Request $request, Waste $waste)
    {
        Gate::authorize('submit', $waste);

        if ($waste->status !== 'BR') {
            throw ValidationException::withMessages([
                'status' => ['Solo se puede declarar un residuo en estado Borrador.'],
            ]);
        }

        $missing = [];

        if (blank($waste->name)) {
            $missing['name'] = ['El nombre es obligatorio para declarar el residuo.'];
        }

        foreach (['waste_category_id', 'quantity', 'measurement_unit_id', 'generation_frequency_id', 'generation_date'] as $field) {
            if (blank($waste->{$field})) {
                $missing[$field] = ["El campo {$field} es obligatorio para declarar el residuo."];
            }
        }

        if ($missing !== []) {
            throw ValidationException::withMessages($missing);
        }

        $hasClassification = $waste->wasteStreamAssignments()->exists() || $waste->wasteUnCodes()->exists();

        if (! $hasClassification) {
            throw ValidationException::withMessages([
                'waste_stream_ids' => ['El residuo debe tener al menos una corriente Y/A o un código UN asignado antes de declararlo.'],
            ]);
        }

        $waste->forceFill(['status' => 'DEC', 'updated_by' => $request->user()->id])->save();

        $this->logSecurityEvent(
            $request, 'WASTE_SUBMITTED', 'SUCCESS',
            "Residuo '{$waste->name}' declarado.", $request->user(),
            ['waste_id' => $waste->id, 'organization_id' => $waste->organization_id],
        );

        return response()->json(['waste' => $waste->fresh()]);
    }

    /**
     * DEC -> REV. Accesible a cualquier usuario con `wastes.review` DENTRO
     * de la misma organización dueña del residuo (o platform staff) -- no es
     * un rol nuevo, es el mismo actor que declaró revisando sus propios
     * datos antes de clasificar.
     */
    public function startReview(Request $request, Waste $waste)
    {
        Gate::authorize('startReview', $waste);

        if ($waste->status !== 'DEC') {
            throw ValidationException::withMessages([
                'status' => ['Solo se puede iniciar revisión desde el estado Declarado.'],
            ]);
        }

        $waste->forceFill(['status' => 'REV', 'updated_by' => $request->user()->id])->save();

        $this->logSecurityEvent(
            $request, 'WASTE_REVIEW_STARTED', 'SUCCESS',
            "Revisión iniciada para el residuo '{$waste->name}'.", $request->user(),
            ['waste_id' => $waste->id, 'organization_id' => $waste->organization_id],
        );

        return response()->json(['waste' => $waste->fresh()]);
    }

    /**
     * REV -> CLS. Fija `last_classification_review_at = now()`.
     */
    public function classify(Request $request, Waste $waste)
    {
        Gate::authorize('classify', $waste);

        if ($waste->status !== 'REV') {
            throw ValidationException::withMessages([
                'status' => ['Solo se puede clasificar un residuo en estado En Revisión.'],
            ]);
        }

        $waste->forceFill([
            'status' => 'CLS',
            'last_classification_review_at' => now(),
            'updated_by' => $request->user()->id,
        ])->save();

        $this->logSecurityEvent(
            $request, 'WASTE_CLASSIFIED', 'SUCCESS',
            "Residuo '{$waste->name}' clasificado.", $request->user(),
            ['waste_id' => $waste->id, 'organization_id' => $waste->organization_id],
        );

        return response()->json(['waste' => $waste->fresh()]);
    }

    /**
     * DEC|REV -> BR (reversible). Guarda `reason` en `security_logs`
     * (metadata).
     */
    public function reject(Request $request, Waste $waste)
    {
        Gate::authorize('reject', $waste);

        $data = $request->validate([
            'reason' => ['required', 'string', 'max:1000'],
        ]);

        if (! in_array($waste->status, ['DEC', 'REV'], true)) {
            throw ValidationException::withMessages([
                'status' => ['Solo se puede rechazar un residuo en estado Declarado o En Revisión.'],
            ]);
        }

        $waste->forceFill(['status' => 'BR', 'updated_by' => $request->user()->id])->save();

        $this->logSecurityEvent(
            $request, 'WASTE_REJECTED', 'SUCCESS',
            "Residuo '{$waste->name}' rechazado: {$data['reason']}", $request->user(),
            ['waste_id' => $waste->id, 'organization_id' => $waste->organization_id, 'reason' => $data['reason']],
        );

        return response()->json(['waste' => $waste->fresh()]);
    }

    /**
     * Reemplaza la pivote COMPLETA de corrientes Y/A asignadas -- mismo
     * patrón que `BranchTreatmentController::syncAllowedWasteStreams()`.
     */
    public function syncWasteStreams(Request $request, Waste $waste)
    {
        Gate::authorize('update', $waste);

        $data = $request->validate([
            'waste_stream_ids' => ['present', 'array'],
            'waste_stream_ids.*' => [
                'integer', 'distinct',
                Rule::exists('waste_streams', 'id')->where('is_active', true)->whereNull('deleted_at'),
            ],
        ]);

        $this->assertWasteStreamsAccessibleBy($data['waste_stream_ids'], $request->user());

        $syncData = collect($data['waste_stream_ids'])
            ->mapWithKeys(fn ($id) => [$id => [
                'tenant_organization_id' => $waste->tenant_organization_id,
                'organization_id' => $waste->organization_id,
                'classification_source' => 'MANUAL',
                'classified_by' => $request->user()->id,
                'classified_at' => now(),
                'created_by' => $request->user()->id,
            ]])
            ->all();

        $waste->wasteStreams()->sync($syncData);

        return response()->json(['waste' => $waste->fresh('wasteStreamAssignments.wasteStream')]);
    }

    /**
     * Mismo patrón exacto que syncWasteStreams(), eje Códigos UN.
     */
    public function syncUnCodes(Request $request, Waste $waste)
    {
        Gate::authorize('update', $waste);

        $data = $request->validate([
            'un_code_ids' => ['present', 'array'],
            'un_code_ids.*' => [
                'integer', 'distinct',
                Rule::exists('un_codes', 'id')->where('is_active', true)->whereNull('deleted_at'),
            ],
        ]);

        $this->assertUnCodesAccessibleBy($data['un_code_ids'], $request->user());

        $syncData = collect($data['un_code_ids'])
            ->mapWithKeys(fn ($id) => [$id => [
                'classification_source' => 'MANUAL',
                'classified_by' => $request->user()->id,
                'classified_at' => now(),
                'created_by' => $request->user()->id,
            ]])
            ->all();

        $waste->unCodes()->sync($syncData);

        return response()->json(['waste' => $waste->fresh('wasteUnCodes.unCode')]);
    }

    /**
     * Reemplaza la pivote completa de características de peligrosidad Y
     * recalcula `waste_danger` (Waste::recalculateWasteDanger()) -- multi-
     * select real sobre un catálogo 100% global, sin problema de IDOR
     * cross-tenant (a diferencia de WasteStream/UnCode).
     */
    public function syncHazardCharacteristics(Request $request, Waste $waste)
    {
        Gate::authorize('update', $waste);

        $data = $request->validate([
            'hazard_characteristic_ids' => ['present', 'array'],
            'hazard_characteristic_ids.*' => [
                'integer', 'distinct',
                Rule::exists('hazard_characteristics', 'id')->where('is_active', true)->whereNull('deleted_at'),
            ],
        ]);

        $syncData = collect($data['hazard_characteristic_ids'])
            ->mapWithKeys(fn ($id) => [$id => ['created_by' => $request->user()->id]])
            ->all();

        $waste->hazardCharacteristics()->sync($syncData);
        $waste->recalculateWasteDanger();

        return response()->json(['waste' => $waste->fresh('wasteHazardCharacteristics.hazardCharacteristic')]);
    }

    /**
     * Tab "Actividad" -- mismo patrón que `BranchTreatmentController::activity()`.
     */
    public function activity(Request $request, Waste $waste)
    {
        abort_unless($request->user()->hasPermission('audit.read'), 403, 'No tiene permiso para consultar la auditoría de residuos.');
        abort_unless($waste->isAccessibleBy($request->user()), 403, 'No tiene acceso a este residuo.');

        $logs = SecurityLog::query()
            ->whereIn('event_type', self::WASTE_EVENTS)
            ->where('metadata->waste_id', $waste->id)
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
     * Tab "Evidencias" del wizard (Paso 4) -- lista los archivos ACTIVOS de
     * este residuo (esquema-bd: `files`, `entity_type='WASTE'`), agrupados
     * por `file_category` (`WASTE_PHOTO`/`SDS`/`ADDITIONAL_DOCUMENT`).
     * Misma autorización dual que el resto del controller (`view`, ya
     * exige `wastes.read` + accesibilidad vía `WastePolicy`).
     */
    public function files(Request $request, Waste $waste)
    {
        Gate::authorize('view', $waste);

        $fileCategory = $request->input('file_category');

        $files = File::query()
            ->where('entity_type', 'WASTE')
            ->where('entity_id', $waste->id)
            ->where('is_active', true)
            ->when($fileCategory, fn ($query) => $query->where('file_category', $fileCategory))
            ->orderByDesc('uploaded_at')
            ->get()
            ->groupBy('file_category');

        return response()->json(['files' => $files]);
    }

    private function statusKpis($actor): array
    {
        $base = Waste::query()->when(
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
     * `organization_id` se maneja aparte (ver store()/update()).
     * `waste_danger`/`status`/`last_classification_review_at` NUNCA se
     * exponen aquí -- ver docblock de la clase.
     */
    private function validationRules(bool $sometimes = false): array
    {
        $required = $sometimes ? 'sometimes' : 'required';

        return [
            'branch_id' => ['sometimes', 'nullable', 'integer', 'exists:branches,id'],
            'waste_category_id' => ['sometimes', 'nullable', 'integer', 'exists:waste_categories,id'],
            'code' => ['sometimes', 'nullable', 'string', 'max:50'],
            'name' => [$required, 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string'],
            'waste_type_id' => ['sometimes', 'integer', 'exists:waste_types,id'],
            'is_template' => ['sometimes', 'boolean'],
            'requires_characterization' => ['sometimes', 'boolean'],
            'requires_sds' => ['sometimes', 'boolean'],
            'physical_state_id' => ['sometimes', 'nullable', 'integer', 'exists:physical_states,id'],
            'measurement_unit_id' => ['sometimes', 'integer', 'exists:measurement_units,id'],
            'average_weight' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'generation_frequency_id' => ['sometimes', 'nullable', 'integer', 'exists:generation_frequencies,id'],
            'requires_special_transport' => ['sometimes', 'boolean'],
            'requires_special_ppe' => ['sometimes', 'boolean'],
            'operational_status_id' => ['sometimes', 'integer', 'exists:waste_operational_statuses,id'],
            'quantity' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'generation_date' => ['sometimes', 'nullable', 'date'],
            'internal_reference' => ['sometimes', 'nullable', 'string', 'max:100'],
            'operational_notes' => ['sometimes', 'nullable', 'string'],
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
                'branch_id' => ['La sede indicada no pertenece a la organización del residuo.'],
            ]);
        }
    }

    /**
     * Resuelve el id de un valor de catálogo por su `code` -- usado para los
     * defaults de aplicación (OPERATIONAL/KG/ACTIVE) que el esquema no puede
     * expresar como default de FK. Falla explícito si el catálogo no está
     * sembrado (nunca inventa un id).
     *
     * @param  class-string<\Illuminate\Database\Eloquent\Model>  $modelClass
     */
    private function defaultCatalogId(string $modelClass, string $code): int
    {
        $id = $modelClass::query()->where('code', $code)->value('id');

        if ($id === null) {
            throw new \LogicException("Catálogo {$modelClass} sin el valor por defecto '{$code}' sembrado.");
        }

        return $id;
    }

    /**
     * Mismo hallazgo de seguridad ya corregido en
     * `BranchTreatmentController` (IDOR): `WasteStream` admite registros
     * privados por tenant -- la regla `exists` de la validación NO verifica
     * accesibilidad, solo existencia.
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
