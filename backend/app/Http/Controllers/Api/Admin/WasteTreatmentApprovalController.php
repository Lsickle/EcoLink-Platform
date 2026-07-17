<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Concerns\LogsSecurityEvents;
use App\Http\Controllers\Controller;
use App\Models\BranchTreatment;
use App\Models\Organization;
use App\Models\Waste;
use App\Models\WasteTreatmentApproval;
use App\Models\WasteType;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * "Evaluación del Gestor" (`waste_treatment_approvals`). Mecanismo de
 * negocio confirmado (no se reabre): cualquier organización puede
 * declarar/clasificar residuos; SOLO organizaciones GESTOR
 * (`can_treat_waste=true`) evalúan si uno de SUS tratamientos es viable para
 * un residuo. El "mecanismo de invitación" es simple: el Generador (dueño
 * del residuo) elige un `branch_treatment_id` de un Gestor concreto y crea
 * la solicitud -- esa elección ES la invitación, no hay paso de invitación
 * aparte.
 *
 * Acceso CRUZADO controlado, distinto del acceso dual platform-staff-vs-
 * tenant del resto del proyecto: `organization_id` de la fila es SIEMPRE el
 * Gestor evaluador; `waste_id` puede pertenecer a CUALQUIER otra
 * organización (el Generador). AMBOS lados pueden VER la fila
 * (`WasteTreatmentApproval::isAccessibleBy()`), pero solo el Gestor puede
 * EDITARLA/EVALUARLA (`isEditableBy()`) -- ver
 * `WasteTreatmentApprovalPolicy`.
 */
class WasteTreatmentApprovalController extends Controller
{
    use LogsSecurityEvents;

    private const TERMINAL_COMMERCIAL_STATUSES = ['APPROVED', 'REJECTED', 'CANCELLED'];

    /**
     * GET /admin/treatment-approvals -- listado GENERAL desde la
     * perspectiva del Gestor. Mismo criterio de acceso dual dentro del eje
     * Gestor (`organization_id`) que el resto del proyecto: platform staff
     * ve todas, un Gestor solo las suyas.
     */
    public function index(Request $request)
    {
        Gate::authorize('viewAny', WasteTreatmentApproval::class);
        $actor = $request->user();

        $search = $request->input('search');
        $technicalStatus = $request->input('technical_status');
        $commercialStatus = $request->input('commercial_status');
        $wasteId = $request->input('waste_id');

        $approvals = WasteTreatmentApproval::query()
            ->when(! $actor->isPlatformStaff(), fn ($query) => $query->where('organization_id', $actor->tenant_organization_id))
            ->when($search, function ($query) use ($search) {
                $query->whereHas('waste', function ($query) use ($search) {
                    $query->where('name', 'ILIKE', "%{$search}%")->orWhere('code', 'ILIKE', "%{$search}%");
                });
            })
            ->when($technicalStatus, fn ($query) => $query->where('technical_status', $technicalStatus))
            ->when($commercialStatus, fn ($query) => $query->where('commercial_status', $commercialStatus))
            ->when($wasteId, fn ($query) => $query->where('waste_id', $wasteId))
            ->with([
                'organization:id,legal_name',
                'waste:id,name,code,organization_id',
                'branchTreatment:id,operational_name,branch_id,treatment_id',
            ])
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 15));

        return response()->json($approvals);
    }

    /**
     * GET /admin/treatment-approvals/{treatmentApproval} -- ambos lados de
     * la relación cruzada pueden ver el detalle, ninguno puede editar el
     * lado ajeno (ver update()/las transiciones).
     */
    public function show(Request $request, WasteTreatmentApproval $treatmentApproval)
    {
        Gate::authorize('view', $treatmentApproval);

        $treatmentApproval->load([
            'organization:id,legal_name',
            'waste:id,name,code,organization_id',
            'waste.organization:id,legal_name',
            // El Gestor evaluador (dueño de organization_id de esta fila) NO
            // tiene acceso directo a GET /admin/wastes/{id} -- WastePolicy::view()
            // lo bloquea correctamente para quien no es dueño del residuo ni
            // platform staff. Esta es la ÚNICA vía autorizada para que vea QUÉ
            // está evaluando (corrientes Y/A, códigos UN, características de
            // peligrosidad del residuo referenciado).
            'waste.wasteStreamAssignments.wasteStream',
            'waste.wasteUnCodes.unCode',
            'waste.wasteHazardCharacteristics.hazardCharacteristic',
            'branchTreatment.treatment',
            'branchTreatment.branch:id,name',
            'technicalApprovedBy:id,username',
            'commercialApprovedBy:id,username',
        ]);

        return response()->json(['treatment_approval' => $treatmentApproval]);
    }

    /**
     * PUT /admin/treatment-approvals/{treatmentApproval} -- SOLO el Gestor
     * evaluador edita términos comerciales/técnicos. El dueño del residuo
     * NO puede editar esta fila (`WasteTreatmentApprovalPolicy::update()`
     * exige `isEditableBy()`, no `isAccessibleBy()`).
     */
    public function update(Request $request, WasteTreatmentApproval $treatmentApproval)
    {
        Gate::authorize('update', $treatmentApproval);

        $data = $request->validate($this->validationRules());

        $treatmentApproval->fill($data);
        $treatmentApproval->save();

        $this->logSecurityEvent(
            $request, 'WASTE_TREATMENT_APPROVAL_UPDATED', 'SUCCESS',
            "Evaluación de tratamiento '{$treatmentApproval->id}' modificada.", $request->user(),
            ['waste_treatment_approval_id' => $treatmentApproval->id, 'organization_id' => $treatmentApproval->organization_id],
        );

        return response()->json(['treatment_approval' => $treatmentApproval->fresh(['organization:id,legal_name', 'branchTreatment.treatment'])]);
    }

    /**
     * POST .../approve-technical -- PENDING -> APPROVED (o RESTRICTED si el
     * body trae `restrictions` no vacío).
     */
    public function approveTechnical(Request $request, WasteTreatmentApproval $treatmentApproval)
    {
        Gate::authorize('evaluate', $treatmentApproval);

        $data = $request->validate([
            'restrictions' => ['sometimes', 'nullable', 'string'],
        ]);

        if ($treatmentApproval->technical_status !== 'PENDING') {
            throw ValidationException::withMessages([
                'technical_status' => ['Solo se puede aprobar técnicamente una evaluación en estado Pendiente.'],
            ]);
        }

        $hasRestrictions = filled($data['restrictions'] ?? null);

        $treatmentApproval->forceFill([
            'technical_status' => $hasRestrictions ? 'RESTRICTED' : 'APPROVED',
            'restrictions' => $data['restrictions'] ?? $treatmentApproval->restrictions,
            'technical_approved_at' => now(),
            'technical_approved_by' => $request->user()->id,
        ])->save();

        $this->logSecurityEvent(
            $request, 'WASTE_TREATMENT_APPROVAL_TECHNICAL_APPROVED', 'SUCCESS',
            "Evaluación técnica '{$treatmentApproval->id}' resuelta como '{$treatmentApproval->technical_status}'.", $request->user(),
            ['waste_treatment_approval_id' => $treatmentApproval->id, 'organization_id' => $treatmentApproval->organization_id],
        );

        return response()->json(['treatment_approval' => $treatmentApproval->fresh()]);
    }

    /**
     * POST .../reject-technical -- PENDING -> REJECTED. Requiere
     * `technical_notes`.
     */
    public function rejectTechnical(Request $request, WasteTreatmentApproval $treatmentApproval)
    {
        Gate::authorize('evaluate', $treatmentApproval);

        $data = $request->validate([
            'technical_notes' => ['required', 'string', 'max:1000'],
        ]);

        if ($treatmentApproval->technical_status !== 'PENDING') {
            throw ValidationException::withMessages([
                'technical_status' => ['Solo se puede rechazar técnicamente una evaluación en estado Pendiente.'],
            ]);
        }

        $treatmentApproval->forceFill([
            'technical_status' => 'REJECTED',
            'technical_notes' => $data['technical_notes'],
        ])->save();

        $this->logSecurityEvent(
            $request, 'WASTE_TREATMENT_APPROVAL_TECHNICAL_REJECTED', 'SUCCESS',
            "Evaluación técnica '{$treatmentApproval->id}' rechazada: {$data['technical_notes']}", $request->user(),
            ['waste_treatment_approval_id' => $treatmentApproval->id, 'organization_id' => $treatmentApproval->organization_id],
        );

        return response()->json(['treatment_approval' => $treatmentApproval->fresh()]);
    }

    /**
     * POST .../approve-commercial -- -> APPROVED. Requiere `unit_price` ya
     * fijado (422 legible si no) y que el eje comercial NO esté ya en un
     * estado final.
     */
    public function approveCommercial(Request $request, WasteTreatmentApproval $treatmentApproval)
    {
        Gate::authorize('evaluate', $treatmentApproval);

        $this->assertCommercialNotFinal($treatmentApproval);

        if ($treatmentApproval->unit_price === null) {
            throw ValidationException::withMessages([
                'unit_price' => ['Debe fijar el precio unitario antes de aprobar comercialmente la evaluación.'],
            ]);
        }

        $treatmentApproval->forceFill([
            'commercial_status' => 'APPROVED',
            'commercial_approved_at' => now(),
            'commercial_approved_by' => $request->user()->id,
        ])->save();

        $this->logSecurityEvent(
            $request, 'WASTE_TREATMENT_APPROVAL_COMMERCIAL_APPROVED', 'SUCCESS',
            "Evaluación comercial '{$treatmentApproval->id}' aprobada.", $request->user(),
            ['waste_treatment_approval_id' => $treatmentApproval->id, 'organization_id' => $treatmentApproval->organization_id],
        );

        return response()->json(['treatment_approval' => $treatmentApproval->fresh()]);
    }

    /**
     * POST .../reject-commercial -- -> REJECTED.
     */
    public function rejectCommercial(Request $request, WasteTreatmentApproval $treatmentApproval)
    {
        Gate::authorize('evaluate', $treatmentApproval);

        $data = $request->validate([
            'commercial_notes' => ['sometimes', 'nullable', 'string', 'max:1000'],
        ]);

        $this->assertCommercialNotFinal($treatmentApproval);

        $treatmentApproval->forceFill([
            'commercial_status' => 'REJECTED',
            'commercial_notes' => $data['commercial_notes'] ?? $treatmentApproval->commercial_notes,
        ])->save();

        $this->logSecurityEvent(
            $request, 'WASTE_TREATMENT_APPROVAL_COMMERCIAL_REJECTED', 'SUCCESS',
            "Evaluación comercial '{$treatmentApproval->id}' rechazada.", $request->user(),
            ['waste_treatment_approval_id' => $treatmentApproval->id, 'organization_id' => $treatmentApproval->organization_id],
        );

        return response()->json(['treatment_approval' => $treatmentApproval->fresh()]);
    }

    /**
     * POST .../quote -- DRAFT -> QUOTED.
     */
    public function quote(Request $request, WasteTreatmentApproval $treatmentApproval)
    {
        Gate::authorize('evaluate', $treatmentApproval);

        if ($treatmentApproval->commercial_status !== 'DRAFT') {
            throw ValidationException::withMessages([
                'commercial_status' => ['Solo se puede cotizar una evaluación en estado Borrador.'],
            ]);
        }

        $treatmentApproval->forceFill(['commercial_status' => 'QUOTED'])->save();

        $this->logSecurityEvent(
            $request, 'WASTE_TREATMENT_APPROVAL_QUOTED', 'SUCCESS',
            "Evaluación comercial '{$treatmentApproval->id}' cotizada.", $request->user(),
            ['waste_treatment_approval_id' => $treatmentApproval->id, 'organization_id' => $treatmentApproval->organization_id],
        );

        return response()->json(['treatment_approval' => $treatmentApproval->fresh()]);
    }

    /**
     * POST .../negotiate -- -> NEGOTIATING.
     */
    public function negotiate(Request $request, WasteTreatmentApproval $treatmentApproval)
    {
        Gate::authorize('evaluate', $treatmentApproval);

        $this->assertCommercialNotFinal($treatmentApproval);

        $treatmentApproval->forceFill(['commercial_status' => 'NEGOTIATING'])->save();

        $this->logSecurityEvent(
            $request, 'WASTE_TREATMENT_APPROVAL_NEGOTIATING', 'SUCCESS',
            "Evaluación comercial '{$treatmentApproval->id}' en negociación.", $request->user(),
            ['waste_treatment_approval_id' => $treatmentApproval->id, 'organization_id' => $treatmentApproval->organization_id],
        );

        return response()->json(['treatment_approval' => $treatmentApproval->fresh()]);
    }

    /**
     * POST .../cancel -- -> CANCELLED.
     */
    public function cancel(Request $request, WasteTreatmentApproval $treatmentApproval)
    {
        Gate::authorize('evaluate', $treatmentApproval);

        if ($treatmentApproval->commercial_status === 'CANCELLED') {
            throw ValidationException::withMessages([
                'commercial_status' => ['La evaluación comercial ya está cancelada.'],
            ]);
        }

        $treatmentApproval->forceFill(['commercial_status' => 'CANCELLED'])->save();

        $this->logSecurityEvent(
            $request, 'WASTE_TREATMENT_APPROVAL_CANCELLED', 'SUCCESS',
            "Evaluación comercial '{$treatmentApproval->id}' cancelada.", $request->user(),
            ['waste_treatment_approval_id' => $treatmentApproval->id, 'organization_id' => $treatmentApproval->organization_id],
        );

        return response()->json(['treatment_approval' => $treatmentApproval->fresh()]);
    }

    /**
     * GET /admin/wastes/{waste}/treatment-approvals -- visible para el
     * dueño del residuo (ve TODAS las que él generó, de cualquier Gestor) Y
     * cada Gestor solo ve LA SUYA dentro de esa lista si no es el dueño del
     * residuo.
     */
    public function indexForWaste(Request $request, Waste $waste)
    {
        abort_unless($request->user()->hasPermission('treatment_approvals.read'), 403, 'No tiene permiso para consultar evaluaciones de tratamiento.');

        $actor = $request->user();
        $isWasteOwnerSide = $waste->isAccessibleBy($actor);

        if (! $isWasteOwnerSide) {
            $hasOwnEvaluation = WasteTreatmentApproval::query()
                ->where('waste_id', $waste->id)
                ->where('organization_id', $actor->tenant_organization_id)
                ->exists();

            abort_unless($hasOwnEvaluation, 403, 'No tiene acceso a las evaluaciones de tratamiento de este residuo.');
        }

        $approvals = WasteTreatmentApproval::query()
            ->where('waste_id', $waste->id)
            ->when(! $isWasteOwnerSide, fn ($query) => $query->where('organization_id', $actor->tenant_organization_id))
            ->with(['organization:id,legal_name', 'branchTreatment.treatment', 'branchTreatment.branch:id,name'])
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 15));

        return response()->json($approvals);
    }

    /**
     * POST /admin/wastes/{waste}/treatment-approvals -- el Generador (dueño
     * accesible del residuo, mismo `Gate::authorize('update', $waste)` ya
     * usado por `WasteController`) elige un `branch_treatment_id` de un
     * Gestor -- esa elección ES la invitación. `organization_id` de la fila
     * nueva se fija SIEMPRE server-side al dueño de `branch_treatment_id`,
     * nunca del payload.
     */
    public function storeForWaste(Request $request, Waste $waste)
    {
        Gate::authorize('update', $waste);
        abort_unless($request->user()->hasPermission('treatment_approvals.create'), 403, 'No tiene permiso para solicitar evaluaciones de tratamiento.');

        $data = $request->validate([
            'branch_treatment_id' => [
                'required', 'integer',
                Rule::exists('branch_treatments', 'id')->where('is_active', true)->whereNull('deleted_at'),
            ],
        ]);

        $branchTreatment = BranchTreatment::query()->findOrFail($data['branch_treatment_id']);
        $this->assertBranchTreatmentOrganizationCanTreatWaste($branchTreatment);
        $this->assertNoActiveDuplicateRequest($waste->id, $branchTreatment->id);

        $approval = WasteTreatmentApproval::query()->create([
            'organization_id' => $branchTreatment->organization_id,
            'waste_id' => $waste->id,
            'branch_treatment_id' => $branchTreatment->id,
            'is_active' => true,
        ]);

        $this->logSecurityEvent(
            $request, 'WASTE_TREATMENT_APPROVAL_CREATED', 'SUCCESS',
            "Evaluación de tratamiento solicitada para el residuo '{$waste->name}'.", $request->user(),
            ['waste_treatment_approval_id' => $approval->id, 'waste_id' => $waste->id, 'organization_id' => $approval->organization_id],
        );

        return response()->json(['treatment_approval' => $approval->fresh(['organization:id,legal_name', 'branchTreatment.treatment'])], 201);
    }

    /**
     * GET /admin/wastes/{waste}/preapproved-matches -- "Tratamiento
     * Preaprobado Detectado". Busca residuos EXISTENTES de tipo
     * `PREAPPROVED` que compartan AL MENOS UNA corriente Y/A o código UN con
     * este residuo Y tengan al menos una evaluación con AMBOS ejes
     * aprobados -- de solo lectura, no crea nada.
     */
    public function preapprovedMatches(Request $request, Waste $waste)
    {
        Gate::authorize('view', $waste);

        $wasteStreamIds = $waste->wasteStreams()->pluck('waste_streams.id');
        $unCodeIds = $waste->unCodes()->pluck('un_codes.id');

        if ($wasteStreamIds->isEmpty() && $unCodeIds->isEmpty()) {
            return response()->json(['matches' => []]);
        }

        $preapprovedWasteTypeId = WasteType::query()->where('code', 'PREAPPROVED')->value('id');

        if ($preapprovedWasteTypeId === null) {
            return response()->json(['matches' => []]);
        }

        $candidateWasteIds = Waste::query()
            ->where('waste_type_id', $preapprovedWasteTypeId)
            ->where('id', '!=', $waste->id)
            ->where(function ($query) use ($wasteStreamIds, $unCodeIds) {
                $query->when(
                    $wasteStreamIds->isNotEmpty(),
                    fn ($query) => $query->orWhereHas('wasteStreams', fn ($query) => $query->whereIn('waste_streams.id', $wasteStreamIds)),
                )->when(
                    $unCodeIds->isNotEmpty(),
                    fn ($query) => $query->orWhereHas('unCodes', fn ($query) => $query->whereIn('un_codes.id', $unCodeIds)),
                );
            })
            ->pluck('id');

        $matches = WasteTreatmentApproval::query()
            ->whereIn('waste_id', $candidateWasteIds)
            ->where('technical_status', 'APPROVED')
            ->where('commercial_status', 'APPROVED')
            ->where('is_active', true)
            ->with(['organization:id,legal_name', 'branchTreatment.treatment', 'branchTreatment.branch:id,name'])
            ->get();

        return response()->json(['matches' => $matches]);
    }

    /**
     * POST /admin/wastes/{waste}/preapproved-matches/{treatmentApproval}/use
     * -- el Generador confirma usar la sugerencia: crea una evaluación
     * NUEVA para SU residuo, copiando los términos comerciales/técnicos de
     * la aprobación preexistente como punto de partida. Decisión propia,
     * documentada (no se auto-aprueba): nace `technical_status=PENDING`/
     * `commercial_status=DRAFT` igual que cualquier otra solicitud nueva --
     * el Gestor siempre debe confirmar explícitamente la solicitud real,
     * aunque el match preaprobado la haga muy probable/rápida de aprobar;
     * auto-aprobar sin acción del Gestor vincularía a una organización a un
     * compromiso sin su participación directa.
     */
    public function usePreapprovedMatch(Request $request, Waste $waste, WasteTreatmentApproval $treatmentApproval)
    {
        Gate::authorize('update', $waste);
        abort_unless($request->user()->hasPermission('treatment_approvals.create'), 403, 'No tiene permiso para solicitar evaluaciones de tratamiento.');

        if (! $treatmentApproval->is_active || $treatmentApproval->technical_status !== 'APPROVED' || $treatmentApproval->commercial_status !== 'APPROVED') {
            throw ValidationException::withMessages([
                'treatment_approval_id' => ['La evaluación indicada no es una aprobación preaprobada válida.'],
            ]);
        }

        $preapprovedWasteTypeId = WasteType::query()->where('code', 'PREAPPROVED')->value('id');
        $sourceWaste = $treatmentApproval->waste;

        $isValidCandidate = $sourceWaste !== null
            && $sourceWaste->id !== $waste->id
            && $sourceWaste->waste_type_id === $preapprovedWasteTypeId
            && (
                $sourceWaste->wasteStreams()->whereIn('waste_streams.id', $waste->wasteStreams()->pluck('waste_streams.id'))->exists()
                || $sourceWaste->unCodes()->whereIn('un_codes.id', $waste->unCodes()->pluck('un_codes.id'))->exists()
            );

        if (! $isValidCandidate) {
            throw ValidationException::withMessages([
                'treatment_approval_id' => ['La evaluación indicada no corresponde a un match preaprobado válido para este residuo.'],
            ]);
        }

        $newApproval = WasteTreatmentApproval::query()->create([
            'organization_id' => $treatmentApproval->organization_id,
            'waste_id' => $waste->id,
            'branch_treatment_id' => $treatmentApproval->branch_treatment_id,
            'unit_price' => $treatmentApproval->unit_price,
            'currency' => $treatmentApproval->currency,
            'billing_unit' => $treatmentApproval->billing_unit,
            'minimum_quantity' => $treatmentApproval->minimum_quantity,
            'maximum_quantity' => $treatmentApproval->maximum_quantity,
            'requires_lab_analysis' => $treatmentApproval->requires_lab_analysis,
            'requires_sds' => $treatmentApproval->requires_sds,
            'restrictions' => $treatmentApproval->restrictions,
            'is_active' => true,
            'metadata' => ['preapproved_match_source_id' => $treatmentApproval->id],
        ]);

        // "Identificado como candidato preaprobado", NO "ya aprobado sin
        // revisión" -- ver docblock del método. El estado real de la nueva
        // fila sigue siendo PENDING/DRAFT.
        $waste->forceFill([
            'is_preapproved' => true,
            'preapproved_by_organization_id' => $treatmentApproval->organization_id,
        ])->save();

        $this->logSecurityEvent(
            $request, 'WASTE_TREATMENT_APPROVAL_PREAPPROVED_MATCH_USED', 'SUCCESS',
            "Match preaprobado usado para el residuo '{$waste->name}' (fuente: evaluación '{$treatmentApproval->id}').", $request->user(),
            ['waste_treatment_approval_id' => $newApproval->id, 'source_waste_treatment_approval_id' => $treatmentApproval->id, 'waste_id' => $waste->id],
        );

        return response()->json(['treatment_approval' => $newApproval->fresh(['organization:id,legal_name', 'branchTreatment.treatment'])], 201);
    }

    private function validationRules(): array
    {
        return [
            'unit_price' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'currency' => ['sometimes', 'string', 'max:10'],
            'billing_unit' => ['sometimes', 'string', 'max:20'],
            'minimum_quantity' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'maximum_quantity' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'requires_lab_analysis' => ['sometimes', 'boolean'],
            'requires_sds' => ['sometimes', 'boolean'],
            'restrictions' => ['sometimes', 'nullable', 'string'],
            'commercial_notes' => ['sometimes', 'nullable', 'string'],
            'technical_notes' => ['sometimes', 'nullable', 'string'],
            'valid_from' => ['sometimes', 'nullable', 'date'],
            'valid_until' => ['sometimes', 'nullable', 'date', 'after_or_equal:valid_from'],
            'detailed_notes' => ['sometimes', 'nullable', 'string'],
        ];
    }

    private function assertCommercialNotFinal(WasteTreatmentApproval $treatmentApproval): void
    {
        if (in_array($treatmentApproval->commercial_status, self::TERMINAL_COMMERCIAL_STATUSES, true)) {
            throw ValidationException::withMessages([
                'commercial_status' => ['La evaluación comercial ya se encuentra en un estado final.'],
            ]);
        }
    }

    /**
     * Mismo criterio de defensa en profundidad que
     * `BranchTreatmentController::assertOrganizationCanTreatWaste()`: SOLO
     * organizaciones con business_role GESTOR (`can_treat_waste=true`)
     * pueden ser evaluadoras.
     */
    private function assertBranchTreatmentOrganizationCanTreatWaste(BranchTreatment $branchTreatment): void
    {
        $organization = Organization::query()->find($branchTreatment->organization_id);

        if (! $organization || ! $organization->hasCapability('can_treat_waste')) {
            throw ValidationException::withMessages([
                'branch_treatment_id' => ['El tratamiento de sede indicado no pertenece a una organización Gestor.'],
            ]);
        }
    }

    /**
     * Hallazgo Media (especialista-seguridad, 2026-07-16): sin este chequeo,
     * un mismo par (waste_id, branch_treatment_id) podía duplicarse -- por
     * error o intencionalmente -- sin ningún límite, creando ruido en la
     * bandeja del Gestor. Validación a nivel de APLICACIÓN (no índice único
     * de BD): se elige así porque la regla real es "sin solicitud ACTIVA
     * duplicada" (`is_active=true`), no "nunca el mismo par en la historia"
     * -- una vez cancelada (`commercial_status=CANCELLED` no desactiva
     * `is_active`, ver cancel(); is_active se apaga solo por soft-delete/
     * futuros mecanismos de archivado) debe poder solicitarse de nuevo. Un
     * UNIQUE de BD simple bloquearía ese caso legítimo; uno parcial
     * (`WHERE is_active`) sería más blindaje pero exige migración -- diferido
     * porque `storeForWaste()` es la ÚNICA vía de creación de esta tabla
     * (sin importación masiva ni otro endpoint), así que el control de
     * aplicación ya cierra el hallazgo real sin ese costo adicional.
     */
    private function assertNoActiveDuplicateRequest(int $wasteId, int $branchTreatmentId): void
    {
        $exists = WasteTreatmentApproval::query()
            ->where('waste_id', $wasteId)
            ->where('branch_treatment_id', $branchTreatmentId)
            ->where('is_active', true)
            ->exists();

        if ($exists) {
            throw ValidationException::withMessages([
                'branch_treatment_id' => ['Ya existe una solicitud de evaluación activa para este residuo y este tratamiento de sede.'],
            ]);
        }
    }
}
