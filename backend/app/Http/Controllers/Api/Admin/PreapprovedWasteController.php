<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Concerns\LogsSecurityEvents;
use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\BranchTreatment;
use App\Models\MeasurementUnit;
use App\Models\Organization;
use App\Models\UnCode;
use App\Models\Waste;
use App\Models\WasteOperationalStatus;
use App\Models\WasteStream;
use App\Models\WasteTreatmentApproval;
use App\Models\WasteType;
use App\Policies\PreapprovedWastePolicy;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * "Residuos Preaprobados" -- gestión de los residuos de referencia
 * (`wastes.waste_type_id` = catálogo `PREAPPROVED`) que alimentan el
 * mecanismo de "Tratamiento Preaprobado Detectado" YA EXISTENTE en
 * `WasteTreatmentApprovalController::preapprovedMatches()`/
 * `usePreapprovedMatch()`. Antes de este controller no existía ninguna
 * forma de crear/gestionar esos residuos de referencia -- el catálogo
 * `waste_type_id=PREAPPROVED` existía sin ningún dato real.
 *
 * Un "Residuo Preaprobado" = un `Waste` propiedad de una organización
 * GESTOR (`can_treat_waste=true`), con clasificación (corrientes Y/A y/o
 * códigos UN) y UNA `WasteTreatmentApproval` que nace YA con AMBOS ejes
 * `APPROVED` -- a diferencia del flujo normal Generador->Gestor
 * (`WasteController::store()` + `WasteTreatmentApprovalController::
 * storeForWaste()` + `approveTechnical()`/`approveCommercial()`), aquí la
 * organización Gestor está declarando SU PROPIO catálogo de "esto ya lo
 * aceptamos bajo estos términos" -- mismo criterio de auto-declaración que
 * RN-191 ya usa en otros módulos operativos de Residuos (ver
 * `BranchTreatmentController`, que también permite a una organización
 * declarar sus propios recursos operativos sin un flujo de aprobación
 * externo).
 *
 * Acceso DUAL, mismo criterio que el resto del proyecto: platform staff
 * gestiona los preaprobados de TODAS las organizaciones Gestor
 * (cross-tenant, por diseño); un admin de tenant solo los de SU PROPIA
 * organización -- ver `Waste::isAccessibleBy()`/`PreapprovedWastePolicy`
 * (invocada EXPLÍCITAMENTE, no vía `Gate::authorize()`, ver docblock de esa
 * clase -- `WastePolicy` ya ocupa la ranura auto-descubierta de `Waste`).
 *
 * AVISO explícito para el hilo principal (señalado también en el resumen de
 * la tarea): este controller introduce (a) una superficie de visibilidad
 * cross-tenant nueva para platform staff sobre organizaciones Gestor, y (b)
 * un flujo de auto-aprobación (`store()`) que se salta el ciclo normal de
 * solicitud/evaluación de `waste_treatment_approvals` -- pendiente de
 * revisión de `especialista-seguridad` antes de construir el frontend.
 */
class PreapprovedWasteController extends Controller
{
    use LogsSecurityEvents;

    /**
     * `organization_id` como filtro OPCIONAL solo tiene efecto para platform
     * staff -- mismo patrón corregido en `OrganizationalAreaController::index()`.
     * Para cualquier otro actor, `organization_id` SIEMPRE se fuerza a su
     * `tenant_organization_id` (el query param se ignora).
     *
     * Decisión (no especificada explícitamente en la tarea, documentada
     * aquí): si la organización del actor NO tiene la capacidad
     * `can_treat_waste`, este endpoint devuelve una lista VACÍA (200), no un
     * 403. Se eligió así porque (1) es un endpoint de solo lectura -- no
     * hay ninguna acción destructiva/sensible que un 403 estaría
     * previniendo; (2) el permiso `preapproved_wastes.read` ya es la puerta
     * de autorización real (verificada por la Policy) -- la capacidad
     * `can_treat_waste` es una condición de NEGOCIO ("esta pantalla no
     * aplica para tu tipo de organización"), no de AUTORIZACIÓN, y una
     * lista vacía comunica eso sin filtrar por qué exactamente está vacía
     * (evita que un actor sin `can_treat_waste` pueda usar la diferencia
     * 403-vs-200-vacío para enumerar qué organizaciones SÍ son Gestor); y
     * (3) es el mismo criterio de "estado vacío silencioso" que
     * `BranchTreatmentController::available()` ya usa para listados sin
     * resultados.
     */
    public function index(Request $request)
    {
        $actor = $request->user();
        abort_unless((new PreapprovedWastePolicy)->viewAny($actor), 403, 'No tiene permiso para consultar residuos preaprobados.');

        $preapprovedWasteTypeId = $this->preapprovedWasteTypeId();

        $organizationId = null;
        $isMultiOrganization = false;
        $forceEmpty = $preapprovedWasteTypeId === null;

        if ($actor->isPlatformStaff()) {
            $validated = $request->validate([
                'organization_id' => ['nullable', 'integer', 'exists:organizations,id'],
            ]);
            $organizationId = $validated['organization_id'] ?? null;
            $isMultiOrganization = $organizationId === null;
        } else {
            $organizationId = $actor->tenant_organization_id;
            $organization = Organization::query()->find($organizationId);
            $forceEmpty = $forceEmpty || ! $organization || ! $organization->hasCapability('can_treat_waste');
        }

        $search = $request->input('search');

        $wastes = Waste::query()
            ->where('waste_type_id', $preapprovedWasteTypeId ?? 0)
            ->when($forceEmpty, fn ($query) => $query->whereRaw('1 = 0'))
            ->when(! $forceEmpty && $organizationId !== null, fn ($query) => $query->where('organization_id', $organizationId))
            ->when($isMultiOrganization && ! $forceEmpty, fn ($query) => $query->with('organization:id,legal_name,tax_id'))
            ->when($search, function ($query) use ($search) {
                $query->where(function ($query) use ($search) {
                    $query->where('name', 'ILIKE', "%{$search}%")->orWhere('code', 'ILIKE', "%{$search}%");
                });
            })
            ->with([
                'wasteStreamAssignments.wasteStream',
                'wasteUnCodes.unCode',
                'treatmentApprovals.branchTreatment.treatment',
                'treatmentApprovals.branchTreatment.branch:id,name',
            ])
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 15));

        return response()->json($wastes);
    }

    /**
     * 404 si el residuo indicado NO es de tipo `PREAPPROVED` -- este
     * endpoint no es para residuos normales (esos ya tienen su propio
     * `WasteController::show()`).
     *
     * Orden anti-oráculo (hallazgo Medio de `especialista-seguridad`): la
     * Policy corre ANTES que `assertIsPreapprovedWaste()`. Si el chequeo de
     * tipo corriera primero, un actor SIN ningún permiso `preapproved_wastes.*`
     * podría distinguir por el código de respuesta si un ID dado es un
     * residuo preaprobado (llegaría a la Policy, 403) o no lo es/no existe
     * (404 inmediato) -- un oráculo de enumeración por ID. Con la Policy
     * primero, `hasPermission()` falla de inmediato para ese actor
     * (cortocircuito del `&&`) y ambos casos responden 403 por igual. Mismo
     * criterio anti-oráculo que `index()` ya aplica deliberadamente (lista
     * vacía en vez de 403 para no filtrar `can_treat_waste`).
     */
    public function show(Request $request, Waste $waste)
    {
        abort_unless((new PreapprovedWastePolicy)->view($request->user(), $waste), 403, 'No tiene acceso a este residuo preaprobado.');
        $this->assertIsPreapprovedWaste($waste);

        $waste->load([
            'organization:id,legal_name,tax_id',
            'wasteCategory',
            'physicalState',
            'measurementUnit',
            'generationFrequency',
            'wasteStreamAssignments.wasteStream',
            'wasteUnCodes.unCode',
            'treatmentApprovals.branchTreatment.treatment',
            'treatmentApprovals.branchTreatment.branch:id,name',
            'treatmentApprovals.technicalApprovedBy:id,username',
            'treatmentApprovals.commercialApprovedBy:id,username',
        ]);

        return response()->json(['waste' => $waste]);
    }

    /**
     * Crea el residuo de referencia Y su `WasteTreatmentApproval`
     * auto-aprobada en una sola transacción. `waste_type_id` SIEMPRE se
     * fuerza server-side al código `PREAPPROVED` -- nunca se acepta del
     * cliente. `approval.branch_treatment_id` DEBE pertenecer a la MISMA
     * organización que el residuo (422 si no, previene declarar un
     * preaprobado usando un tratamiento ajeno).
     */
    public function store(Request $request)
    {
        $actor = $request->user();
        abort_unless((new PreapprovedWastePolicy)->create($actor), 403, 'No tiene permiso para declarar residuos preaprobados.');

        // Anti-role-smuggling (mismo criterio que WasteController::store()):
        // un tenant admin SIEMPRE crea en SU propia organización, sin
        // importar lo que venga en el payload.
        $organizationId = $actor->isPlatformStaff()
            ? $request->integer('organization_id')
            : $actor->tenant_organization_id;

        $rules = array_merge(
            $this->wasteValidationRules(),
            $this->classificationValidationRules(),
            $this->approvalValidationRules(),
        );

        if ($actor->isPlatformStaff()) {
            $rules['organization_id'] = ['required', 'integer', 'exists:organizations,id'];
        }

        $data = $request->validate($rules);

        $this->assertOrganizationCanTreatWaste($organizationId);

        if (! empty($data['branch_id'])) {
            $this->assertBranchBelongsToOrganization($data['branch_id'], $organizationId);
        }

        $branchTreatment = BranchTreatment::query()->findOrFail($data['approval']['branch_treatment_id']);
        $this->assertBranchTreatmentBelongsToOrganization($branchTreatment, $organizationId);

        $wasteStreamIds = $data['waste_stream_ids'] ?? [];
        $unCodeIds = $data['un_code_ids'] ?? [];

        if ($wasteStreamIds === [] && $unCodeIds === []) {
            throw ValidationException::withMessages([
                'waste_stream_ids' => ['El residuo preaprobado debe tener al menos una corriente Y/A o un código UN asignado.'],
            ]);
        }

        $this->assertWasteStreamsAccessibleBy($wasteStreamIds, $actor);
        $this->assertUnCodesAccessibleBy($unCodeIds, $actor);

        $preapprovedWasteTypeId = $this->preapprovedWasteTypeId();

        if ($preapprovedWasteTypeId === null) {
            throw new \LogicException("Catálogo WasteType sin el valor por defecto 'PREAPPROVED' sembrado.");
        }

        $waste = DB::transaction(function () use ($data, $organizationId, $actor, $preapprovedWasteTypeId, $wasteStreamIds, $unCodeIds, $branchTreatment) {
            $wasteData = collect($data)->except(['organization_id', 'approval', 'waste_stream_ids', 'un_code_ids'])->all();
            $wasteData['organization_id'] = $organizationId;
            $wasteData['waste_type_id'] = $preapprovedWasteTypeId;
            $wasteData['measurement_unit_id'] ??= $this->defaultCatalogId(MeasurementUnit::class, 'KG');
            $wasteData['operational_status_id'] = $this->defaultCatalogId(WasteOperationalStatus::class, 'ACTIVE');
            $wasteData['is_active'] = true;
            $wasteData['created_by'] = $actor->id;
            $wasteData['updated_by'] = $actor->id;

            $waste = Waste::query()->create($wasteData);

            // El residuo preaprobado nace ya CLASIFICADO (`CLS`) -- es un
            // catálogo de referencia auto-declarado por el propio Gestor,
            // no un residuo real de un Generador que deba pasar por el
            // workflow BR->DEC->REV->CLS (submit()/startReview()/
            // classify()). Mismo criterio de auto-declaración que la
            // aprobación (ver docblock de la clase).
            $waste->forceFill(['status' => 'CLS', 'last_classification_review_at' => now()])->save();

            if ($wasteStreamIds !== []) {
                $syncData = collect($wasteStreamIds)->mapWithKeys(fn ($id) => [$id => [
                    'tenant_organization_id' => $waste->tenant_organization_id,
                    'organization_id' => $organizationId,
                    'classification_source' => 'MANUAL',
                    'classified_by' => $actor->id,
                    'classified_at' => now(),
                    'created_by' => $actor->id,
                ]])->all();
                $waste->wasteStreams()->sync($syncData);
            }

            if ($unCodeIds !== []) {
                $syncData = collect($unCodeIds)->mapWithKeys(fn ($id) => [$id => [
                    'classification_source' => 'MANUAL',
                    'classified_by' => $actor->id,
                    'classified_at' => now(),
                    'created_by' => $actor->id,
                ]])->all();
                $waste->unCodes()->sync($syncData);
            }

            $approvalAttributes = collect($data['approval'])->only([
                'unit_price', 'currency', 'billing_unit', 'minimum_quantity', 'maximum_quantity',
                'requires_lab_analysis', 'requires_sds', 'restrictions', 'valid_from', 'valid_until',
            ])->all();

            $approval = WasteTreatmentApproval::query()->create([
                ...$approvalAttributes,
                'organization_id' => $organizationId,
                'waste_id' => $waste->id,
                'branch_treatment_id' => $branchTreatment->id,
                'is_active' => true,
            ]);

            // `technical_status`/`commercial_status`/los campos de
            // aprobación NO están en el Fillable del modelo (por diseño --
            // ver docblock de `WasteTreatmentApproval`, solo se tocan vía
            // las transiciones dedicadas de `WasteTreatmentApprovalController`,
            // nunca vía asignación masiva). Auto-aprobación: la organización
            // Gestor está declarando SU PROPIO catálogo ("esto ya lo
            // aceptamos bajo estos términos"), por eso ambos ejes nacen
            // APPROVED en el mismo acto de creación -- sin pasar por
            // storeForWaste()/approve-technical/approve-commercial (ver
            // docblock de la clase para el razonamiento completo).
            $approval->forceFill([
                'technical_status' => 'APPROVED',
                'commercial_status' => 'APPROVED',
                'technical_approved_at' => now(),
                'technical_approved_by' => $actor->id,
                'commercial_approved_at' => now(),
                'commercial_approved_by' => $actor->id,
            ])->save();

            return $waste;
        });

        $this->logSecurityEvent(
            $request, 'PREAPPROVED_WASTE_CREATED', 'SUCCESS',
            "Residuo preaprobado '{$waste->name}' creado.", $actor,
            ['waste_id' => $waste->id, 'organization_id' => $waste->organization_id],
        );

        return response()->json(['waste' => $waste->fresh([
            'organization:id,legal_name',
            'wasteStreamAssignments.wasteStream',
            'wasteUnCodes.unCode',
            'treatmentApprovals.branchTreatment.treatment',
        ])], 201);
    }

    /**
     * Permite editar clasificación (corrientes Y/A, códigos UN) y/o los
     * términos comerciales/técnicos de la `WasteTreatmentApproval` asociada.
     * `organization_id`/`waste_type_id` NUNCA editables tras creación --
     * mismo criterio que `WasteController::update()`.
     */
    public function update(Request $request, Waste $waste)
    {
        $actor = $request->user();
        abort_unless((new PreapprovedWastePolicy)->update($actor, $waste), 403, 'No tiene acceso a este residuo preaprobado.');
        $this->assertIsPreapprovedWaste($waste);

        $rules = array_merge(
            $this->wasteValidationRules(sometimes: true),
            $this->classificationValidationRules(),
            $this->approvalValidationRules(sometimes: true),
        );

        $data = $request->validate($rules);

        if (array_key_exists('branch_id', $data) && $data['branch_id'] !== null) {
            $this->assertBranchBelongsToOrganization($data['branch_id'], $waste->organization_id);
        }

        $wasteData = collect($data)->except(['approval', 'waste_stream_ids', 'un_code_ids'])->all();

        $waste->fill($wasteData);
        $waste->updated_by = $actor->id;
        $waste->save();

        if (array_key_exists('waste_stream_ids', $data)) {
            $this->assertWasteStreamsAccessibleBy($data['waste_stream_ids'], $actor);

            $syncData = collect($data['waste_stream_ids'])->mapWithKeys(fn ($id) => [$id => [
                'tenant_organization_id' => $waste->tenant_organization_id,
                'organization_id' => $waste->organization_id,
                'classification_source' => 'MANUAL',
                'classified_by' => $actor->id,
                'classified_at' => now(),
                'created_by' => $actor->id,
            ]])->all();

            $waste->wasteStreams()->sync($syncData);
        }

        if (array_key_exists('un_code_ids', $data)) {
            $this->assertUnCodesAccessibleBy($data['un_code_ids'], $actor);

            $syncData = collect($data['un_code_ids'])->mapWithKeys(fn ($id) => [$id => [
                'classification_source' => 'MANUAL',
                'classified_by' => $actor->id,
                'classified_at' => now(),
                'created_by' => $actor->id,
            ]])->all();

            $waste->unCodes()->sync($syncData);
        }

        if (array_key_exists('approval', $data)) {
            $approval = $this->primaryApprovalFor($waste);

            if ($approval) {
                if (array_key_exists('branch_treatment_id', $data['approval'])) {
                    $branchTreatment = BranchTreatment::query()->findOrFail($data['approval']['branch_treatment_id']);
                    $this->assertBranchTreatmentBelongsToOrganization($branchTreatment, $waste->organization_id);
                }

                $approval->fill($data['approval']);
                $approval->save();
            }
        }

        $this->logSecurityEvent(
            $request, 'PREAPPROVED_WASTE_UPDATED', 'SUCCESS',
            "Residuo preaprobado '{$waste->name}' modificado.", $actor,
            ['waste_id' => $waste->id, 'organization_id' => $waste->organization_id],
        );

        return response()->json(['waste' => $waste->fresh([
            'organization:id,legal_name',
            'wasteStreamAssignments.wasteStream',
            'wasteUnCodes.unCode',
            'treatmentApprovals.branchTreatment.treatment',
        ])]);
    }

    /**
     * Alterna `is_active` del residuo Y, en cascada, de su(s)
     * `WasteTreatmentApproval` asociada(s) -- decisión: SÍ desactivar en
     * cascada. `preapprovedMatches()` (ver `WasteTreatmentApprovalController`)
     * ya filtra por `is_active=true` en la aprobación, no en el residuo --
     * sin esta cascada, inactivar el residuo de referencia no tendría
     * ningún efecto real sobre el matching dinámico (seguiría
     * ofreciéndose), lo cual contradice la intención obvia de "inactivar
     * este preaprobado". Simétrico en activate(): reactiva ambos.
     */
    public function activate(Request $request, Waste $waste)
    {
        $actor = $request->user();
        abort_unless((new PreapprovedWastePolicy)->update($actor, $waste), 403, 'No tiene acceso a este residuo preaprobado.');
        $this->assertIsPreapprovedWaste($waste);

        $waste->forceFill(['is_active' => true, 'updated_by' => $actor->id])->save();
        $waste->treatmentApprovals()->update(['is_active' => true]);

        $this->logSecurityEvent(
            $request, 'PREAPPROVED_WASTE_ACTIVATED', 'SUCCESS',
            "Residuo preaprobado '{$waste->name}' activado.", $actor,
            ['waste_id' => $waste->id, 'organization_id' => $waste->organization_id],
        );

        return response()->json(['waste' => $waste->fresh()]);
    }

    public function deactivate(Request $request, Waste $waste)
    {
        $actor = $request->user();
        abort_unless((new PreapprovedWastePolicy)->update($actor, $waste), 403, 'No tiene acceso a este residuo preaprobado.');
        $this->assertIsPreapprovedWaste($waste);

        $waste->forceFill(['is_active' => false, 'updated_by' => $actor->id])->save();
        $waste->treatmentApprovals()->update(['is_active' => false]);

        $this->logSecurityEvent(
            $request, 'PREAPPROVED_WASTE_DEACTIVATED', 'SUCCESS',
            "Residuo preaprobado '{$waste->name}' inactivado.", $actor,
            ['waste_id' => $waste->id, 'organization_id' => $waste->organization_id],
        );

        return response()->json(['waste' => $waste->fresh()]);
    }

    private function preapprovedWasteTypeId(): ?int
    {
        return WasteType::query()->where('code', 'PREAPPROVED')->value('id');
    }

    /**
     * SIEMPRE se invoca DESPUÉS de la Policy en los 4 métodos que la usan
     * (`show()`/`update()`/`activate()`/`deactivate()`) -- ver docblock de
     * `show()` para el razonamiento anti-oráculo completo.
     */
    private function assertIsPreapprovedWaste(Waste $waste): void
    {
        abort_unless($waste->waste_type_id === $this->preapprovedWasteTypeId(), 404);
    }

    /**
     * Toma la PRIMERA `WasteTreatmentApproval` del residuo -- en este flujo
     * (creación exclusiva vía `store()`) siempre hay exactamente una,
     * `organization_id` idéntico al del propio residuo (a diferencia del
     * flujo cruzado normal Generador->Gestor).
     */
    private function primaryApprovalFor(Waste $waste): ?WasteTreatmentApproval
    {
        return $waste->treatmentApprovals()->oldest('id')->first();
    }

    /**
     * `organization_id`/`waste_type_id` nunca aceptados aquí -- se resuelven
     * server-side en store()/no editables en update() (ver docblocks).
     */
    private function wasteValidationRules(bool $sometimes = false): array
    {
        $required = $sometimes ? 'sometimes' : 'required';

        return [
            'branch_id' => ['sometimes', 'nullable', 'integer', 'exists:branches,id'],
            'waste_category_id' => ['sometimes', 'nullable', 'integer', 'exists:waste_categories,id'],
            'code' => ['sometimes', 'nullable', 'string', 'max:50'],
            'name' => [$required, 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string'],
            'physical_state_id' => ['sometimes', 'nullable', 'integer', 'exists:physical_states,id'],
            'measurement_unit_id' => ['sometimes', 'integer', 'exists:measurement_units,id'],
            'average_weight' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'generation_frequency_id' => ['sometimes', 'nullable', 'integer', 'exists:generation_frequencies,id'],
            'requires_special_transport' => ['sometimes', 'boolean'],
            'requires_special_ppe' => ['sometimes', 'boolean'],
            'requires_characterization' => ['sometimes', 'boolean'],
            'requires_sds' => ['sometimes', 'boolean'],
        ];
    }

    private function classificationValidationRules(): array
    {
        return [
            'waste_stream_ids' => ['sometimes', 'array'],
            'waste_stream_ids.*' => [
                'integer', 'distinct',
                Rule::exists('waste_streams', 'id')->where('is_active', true)->whereNull('deleted_at'),
            ],
            'un_code_ids' => ['sometimes', 'array'],
            'un_code_ids.*' => [
                'integer', 'distinct',
                Rule::exists('un_codes', 'id')->where('is_active', true)->whereNull('deleted_at'),
            ],
        ];
    }

    /**
     * Anidados bajo `approval.*` (en vez de aplanados) a propósito: tanto
     * `wastes` como `waste_treatment_approvals` tienen una columna
     * `requires_sds` con significado distinto (el residuo en sí requiere
     * SDS vs. esta evaluación puntual la requiere) -- aplanar ambos grupos
     * de campos en el mismo nivel del payload los haría colisionar.
     */
    private function approvalValidationRules(bool $sometimes = false): array
    {
        $required = $sometimes ? 'sometimes' : 'required';

        return [
            'approval' => [$sometimes ? 'sometimes' : 'required', 'array'],
            'approval.branch_treatment_id' => [
                $required, 'integer',
                Rule::exists('branch_treatments', 'id')->where('is_active', true)->whereNull('deleted_at'),
            ],
            'approval.unit_price' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'approval.currency' => ['sometimes', 'string', 'max:10'],
            'approval.billing_unit' => ['sometimes', 'string', 'max:20'],
            'approval.minimum_quantity' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'approval.maximum_quantity' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'approval.requires_lab_analysis' => ['sometimes', 'boolean'],
            'approval.requires_sds' => ['sometimes', 'boolean'],
            'approval.restrictions' => ['sometimes', 'nullable', 'string'],
            'approval.valid_from' => ['sometimes', 'nullable', 'date'],
            'approval.valid_until' => ['sometimes', 'nullable', 'date', 'after_or_equal:approval.valid_from'],
        ];
    }

    /**
     * Mismo helper conceptual que `WasteController::assertBranchBelongsToOrganization()`.
     */
    private function assertBranchBelongsToOrganization(int $branchId, ?int $organizationId): void
    {
        $branch = Branch::withTrashed()->find($branchId);

        if ($branch && (int) $branch->organization_id !== (int) $organizationId) {
            throw ValidationException::withMessages([
                'branch_id' => ['La sede indicada no pertenece a la organización del residuo preaprobado.'],
            ]);
        }
    }

    /**
     * RN-191 (auto-declaración): el `branch_treatment_id` de la aprobación
     * DEBE pertenecer a la MISMA organización que el residuo preaprobado --
     * previene que una organización declare un preaprobado usando un
     * tratamiento de sede AJENO.
     */
    private function assertBranchTreatmentBelongsToOrganization(BranchTreatment $branchTreatment, ?int $organizationId): void
    {
        if ((int) $branchTreatment->organization_id !== (int) $organizationId) {
            throw ValidationException::withMessages([
                'approval.branch_treatment_id' => ['El tratamiento de sede indicado debe pertenecer a la misma organización del residuo preaprobado.'],
            ]);
        }
    }

    /**
     * Mismo criterio que `BranchTreatmentController::assertOrganizationCanTreatWaste()`:
     * SOLO organizaciones con business_role GESTOR (`can_treat_waste=true`)
     * pueden declarar residuos preaprobados -- un "preaprobado" es, por
     * definición, un residuo de referencia que ya tiene una aprobación de
     * tratamiento completa contra uno de los `branch_treatments` PROPIOS de
     * esa organización, algo que solo tiene sentido para un Gestor.
     */
    private function assertOrganizationCanTreatWaste(?int $organizationId): void
    {
        $organization = Organization::query()->find($organizationId);

        if (! $organization || ! $organization->hasCapability('can_treat_waste')) {
            throw ValidationException::withMessages([
                'organization_id' => ['Solo organizaciones Gestor pueden declarar residuos preaprobados.'],
            ]);
        }
    }

    /**
     * Resuelve el id de un valor de catálogo por su `code` -- mismo patrón
     * que `WasteController::defaultCatalogId()`. Falla explícito si el
     * catálogo no está sembrado (nunca inventa un id).
     *
     * @param  class-string<Model>  $modelClass
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
     * Mismo hallazgo de seguridad ya corregido en `WasteController`/
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
