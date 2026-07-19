<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Concerns\LogsSecurityEvents;
use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\CancellationReason;
use App\Models\Organization;
use App\Models\OrganizationCarteraStatus;
use App\Models\ServiceItemStatus;
use App\Models\ServiceStatus;
use App\Models\Waste;
use App\Models\WasteServiceRequest;
use App\Models\WasteServiceRequestItem;
use App\Models\WasteTreatmentApproval;
use App\Policies\ServiceRequestPolicy;
use App\Services\ServiceRequestApprovalService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Fase 1b del Módulo Solicitudes de Servicio (D-S01/D-S02/D-S04/D-S06/D-S09/
 * D-S12/D-S25/D-S27) -- CRUD + ciclo de vida temprano de
 * `waste_service_requests`. La lógica de agregado cabecera<->ítems y las
 * transiciones de cabecera viven en {@see ServiceRequestApprovalService}
 * (D-S27), NO en este controller.
 *
 * Acceso NO simétrico -- ver docblock completo en `ServiceRequestPolicy`:
 * el Generador dueño ve/edita/cancela SU solicitud; un Gestor con AL MENOS
 * UN ítem asignado puede VERLA pero solo EVALUAR sus propios ítems; platform
 * staff, acceso total.
 *
 * Transiciones `APPROVED->SCHEDULED`/`SCHEDULED->IN_EXECUTION`/
 * `IN_EXECUTION->COMPLETED` NO se exponen aquí -- ya sembradas como
 * placeholder en `ServiceRequestWorkflowSeeder` para completar el grafo,
 * pertenecen al futuro módulo de Programación/Dispatch (Fase 2).
 */
class ServiceRequestController extends Controller
{
    use LogsSecurityEvents;

    /**
     * Un Generador ve SUS solicitudes (`organization_id` propio); un Gestor
     * ve las solicitudes donde tiene AL MENOS UN ítem asignado (join sobre
     * `waste_service_request_items.waste_treatment_approval.organization_id`);
     * platform staff ve todas (filtro `organization_id` opcional, mismo
     * patrón ya usado en `PreapprovedWasteController::index()`). Una misma
     * organización con doble capacidad (Generador Y Gestor) ve la UNIÓN de
     * ambos criterios.
     */
    public function index(Request $request)
    {
        $actor = $request->user();
        abort_unless((new ServiceRequestPolicy)->viewAny($actor), 403, 'No tiene permiso para consultar solicitudes de servicio.');

        $organizationId = $request->input('organization_id');
        $search = $request->input('search');
        $statusCode = $request->input('status');

        $serviceRequests = WasteServiceRequest::query()
            ->when($actor->isPlatformStaff(), fn ($query) => $query->when($organizationId, fn ($query) => $query->where('organization_id', $organizationId)))
            ->when(! $actor->isPlatformStaff(), function ($query) use ($actor) {
                $query->where(function ($query) use ($actor) {
                    $query->where('organization_id', $actor->tenant_organization_id)
                        ->orWhereHas('items.wasteTreatmentApproval', function ($query) use ($actor) {
                            $query->where('organization_id', $actor->tenant_organization_id);
                        });
                });
            })
            ->when($search, fn ($query) => $query->where('request_code', 'ILIKE', "%{$search}%"))
            ->when($statusCode, function ($query) use ($statusCode) {
                $query->whereHas('serviceStatus', fn ($query) => $query->where('code', $statusCode));
            })
            ->with(['organization:id,legal_name', 'branch:id,name', 'serviceStatus'])
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 15));

        return response()->json($serviceRequests);
    }

    /**
     * Hallazgo Media (especialista-seguridad, revisión de
     * `ServiceRequestController`, 2026-07-19, confirmado por el usuario):
     * antes de este fix, CUALQUIER Gestor con al menos un ítem asignado veía
     * el detalle COMPLETO de los ítems de OTROS Gestores en la misma
     * solicitud (razón social, cantidades, tratamiento) -- una fuga de datos
     * comerciales entre competidores. Ahora:
     * - platform staff o el Generador dueño (`isAccessibleBy()`): ven TODOS
     *   los ítems con su detalle completo, sin cambios.
     * - un Gestor con >=1 ítem propio (nunca dueño): ve el detalle completo
     *   SOLO de sus propios ítems (`WasteServiceRequestItem::isEvaluableBy()`,
     *   mismo criterio D-S25 ya usado por `approveItem()`/`rejectItem()`); los
     *   ítems de OTROS Gestores se reducen a `id`/`item_sequence` (existencia
     *   sin identidad/cantidad/tratamiento), más un `other_items_count`
     *   agregado.
     */
    public function show(Request $request, WasteServiceRequest $serviceRequest)
    {
        $actor = $request->user();
        abort_unless((new ServiceRequestPolicy)->view($actor, $serviceRequest), 403, 'No tiene acceso a esta solicitud de servicio.');

        $serviceRequest->load([
            'organization:id,legal_name',
            'branch:id,name',
            'serviceStatus',
            'cancellationReason',
            'measurementUnit',
            'requestedBy:id,username',
            'items.waste:id,name,code,organization_id',
            'items.wasteTreatmentApproval.organization:id,legal_name',
            'items.wasteTreatmentApproval.branchTreatment.treatment',
            'items.itemStatus',
            'items.measurementUnit',
            'items.physicalState',
        ]);

        if ($actor->isPlatformStaff() || $serviceRequest->isAccessibleBy($actor)) {
            return response()->json(['service_request' => $serviceRequest]);
        }

        $payload = $serviceRequest->toArray();
        $otherItemsCount = 0;

        $payload['items'] = $serviceRequest->items
            ->map(function (WasteServiceRequestItem $item) use ($actor, &$otherItemsCount) {
                if ($item->isEvaluableBy($actor)) {
                    return $item->toArray();
                }

                $otherItemsCount++;

                return [
                    'id' => $item->id,
                    'item_sequence' => $item->item_sequence,
                ];
            })
            ->values()
            ->all();

        $payload['other_items_count'] = $otherItemsCount;

        return response()->json(['service_request' => $payload]);
    }

    /**
     * Crea la cabecera en `DRAFT` + ítems, en una única transacción. Cada
     * ítem valida (D-S06): (a) el `waste_id` pertenece a la organización
     * actora (anti-IDOR); (b) si trae `waste_treatment_approval_id`, esa
     * aprobación pertenece al MISMO residuo (anti-IDOR de aprobación ajena)
     * Y tiene AMBOS ejes aprobados (tratamiento viable); (c) cartera
     * bilateral (D-S04/D-S12): si el par Generador<->Gestor de ese ítem
     * tiene un `organization_cartera_statuses` activo que bloquea nuevas
     * solicitudes, 422.
     */
    public function store(Request $request)
    {
        $actor = $request->user();

        // Anti-role-smuggling (mismo criterio que WasteController::store()):
        // un tenant admin SIEMPRE crea en SU propia organización.
        $organizationId = $actor->isPlatformStaff()
            ? $request->integer('organization_id')
            : $actor->tenant_organization_id;

        abort_unless((new ServiceRequestPolicy)->create($actor, $organizationId), 403, 'No tiene permiso para crear solicitudes de servicio.');

        $rules = $this->headerValidationRules();
        $rules = array_merge($rules, $this->itemValidationRules());

        if ($actor->isPlatformStaff()) {
            $rules['organization_id'] = ['required', 'integer', 'exists:organizations,id'];
        }

        $data = $request->validate($rules);

        $this->assertOrganizationCanGenerateWaste($organizationId);

        if (! empty($data['branch_id'])) {
            $this->assertBranchBelongsToOrganization($data['branch_id'], $organizationId);
        }

        $items = $data['items'];
        unset($data['items'], $data['organization_id']);

        $resolvedItems = $this->resolveAndValidateItems($items, $organizationId);

        $draftStatusId = $this->defaultCatalogId(ServiceStatus::class, 'DRAFT', ['organization_id' => null]);
        $pendingItemStatusId = $this->defaultCatalogId(ServiceItemStatus::class, 'PENDING');

        $serviceRequest = DB::transaction(function () use ($data, $organizationId, $actor, $resolvedItems, $draftStatusId, $pendingItemStatusId) {
            $data['tenant_organization_id'] = $actor->tenant_organization_id;
            $data['organization_id'] = $organizationId;
            $data['request_code'] = $this->generateRequestCode($organizationId);
            $data['requested_by'] ??= $actor->id;
            $data['is_active'] = true;

            // `service_status_id`/`created_by`/`updated_by` se retiran
            // deliberadamente del $fillable del modelo (ver su docblock) --
            // solo deben cambiar vía forceFill(), nunca mass-assignment.
            $serviceRequest = new WasteServiceRequest;
            $serviceRequest->fill($data);
            $serviceRequest->forceFill([
                'service_status_id' => $draftStatusId,
                'created_by' => $actor->id,
                'updated_by' => $actor->id,
            ]);
            $serviceRequest->save();

            foreach ($resolvedItems as $index => $resolved) {
                /** @var Waste $waste */
                $waste = $resolved['waste'];
                /** @var WasteTreatmentApproval|null $approval */
                $approval = $resolved['approval'];
                $itemData = $resolved['data'];

                WasteServiceRequestItem::query()->create([
                    ...collect($itemData)->except(['waste_id', 'waste_treatment_approval_id'])->all(),
                    'tenant_organization_id' => $actor->tenant_organization_id,
                    'service_request_id' => $serviceRequest->id,
                    'item_sequence' => $index + 1,
                    'waste_id' => $waste->id,
                    'waste_treatment_approval_id' => $approval?->id,
                    'waste_name_snapshot' => $waste->name,
                    'waste_code_snapshot' => $waste->code,
                    'treatment_snapshot' => $approval?->branchTreatment?->treatment?->name,
                    'item_status_id' => $pendingItemStatusId,
                    'is_active' => true,
                ]);
            }

            return $serviceRequest;
        });

        $this->logSecurityEvent(
            $request, 'SERVICE_REQUEST_CREATED', 'SUCCESS',
            "Solicitud de servicio '{$serviceRequest->request_code}' creada.", $actor,
            ['service_request_id' => $serviceRequest->id, 'organization_id' => $organizationId],
        );

        return response()->json(['service_request' => $serviceRequest->fresh(['items', 'serviceStatus', 'organization:id,legal_name', 'branch:id,name'])], 201);
    }

    /**
     * D-S15: editar SOLO mientras la solicitud esté en `DRAFT` -- fuera de
     * alcance de este método el sync de ítems (creación/eliminación de
     * líneas); solo campos de cabecera. Ver AVISO en el resumen de la tarea.
     */
    public function update(Request $request, WasteServiceRequest $serviceRequest)
    {
        $actor = $request->user();
        abort_unless((new ServiceRequestPolicy)->update($actor, $serviceRequest), 403, 'No tiene acceso a esta solicitud de servicio.');

        if ($serviceRequest->serviceStatus?->code !== 'DRAFT') {
            throw ValidationException::withMessages([
                'service_status' => ['Solo se puede editar una solicitud en estado Borrador.'],
            ]);
        }

        $data = $request->validate($this->headerValidationRules(sometimes: true));

        if (array_key_exists('branch_id', $data) && $data['branch_id'] !== null) {
            $this->assertBranchBelongsToOrganization($data['branch_id'], $serviceRequest->organization_id);
        }

        $serviceRequest->fill($data);
        $serviceRequest->updated_by = $actor->id;
        $serviceRequest->save();

        $this->logSecurityEvent(
            $request, 'SERVICE_REQUEST_UPDATED', 'SUCCESS',
            "Solicitud de servicio '{$serviceRequest->request_code}' modificada.", $actor,
            ['service_request_id' => $serviceRequest->id, 'organization_id' => $serviceRequest->organization_id],
        );

        return response()->json(['service_request' => $serviceRequest->fresh(['items', 'serviceStatus'])]);
    }

    /**
     * DRAFT -> SUBMITTED -> UNDER_REVIEW (D-S13: la segunda transición es
     * AUTOMÁTICA, sin actor propio -- se aplica en el mismo request
     * inmediatamente después de SUBMITTED, no hay un paso intermedio de
     * espera modelado en este lote). Exige (D-S06/D-S07): al menos un ítem,
     * y que TODOS los ítems tengan `waste_treatment_approval_id`,
     * `estimated_quantity` y `measurement_unit_id` completos (ya no
     * nullable a partir de este punto).
     */
    public function submit(Request $request, WasteServiceRequest $serviceRequest)
    {
        $actor = $request->user();
        abort_unless((new ServiceRequestPolicy)->update($actor, $serviceRequest), 403, 'No tiene acceso a esta solicitud de servicio.');

        if ($serviceRequest->serviceStatus?->code !== 'DRAFT') {
            throw ValidationException::withMessages([
                'service_status' => ['Solo se puede enviar una solicitud en estado Borrador.'],
            ]);
        }

        $items = $serviceRequest->items()->get();

        if ($items->isEmpty()) {
            throw ValidationException::withMessages([
                'items' => ['La solicitud debe tener al menos un ítem para poder enviarse.'],
            ]);
        }

        $missing = [];

        foreach ($items as $index => $item) {
            if ($item->waste_treatment_approval_id === null) {
                $missing["items.{$index}.waste_treatment_approval_id"] = ['Debe asignar una aprobación de tratamiento vigente a este ítem antes de enviar la solicitud.'];
            }
            if ($item->estimated_quantity === null) {
                $missing["items.{$index}.estimated_quantity"] = ['La cantidad estimada es obligatoria antes de enviar la solicitud.'];
            }
            if ($item->measurement_unit_id === null) {
                $missing["items.{$index}.measurement_unit_id"] = ['La unidad de medida es obligatoria antes de enviar la solicitud.'];
            }
        }

        if ($missing !== []) {
            throw ValidationException::withMessages($missing);
        }

        ServiceRequestApprovalService::transitionHeader($serviceRequest, $actor, 'SUBMITTED');
        ServiceRequestApprovalService::transitionHeader($serviceRequest->fresh(), $actor, 'UNDER_REVIEW');

        $this->logSecurityEvent(
            $request, 'SERVICE_REQUEST_SUBMITTED', 'SUCCESS',
            "Solicitud de servicio '{$serviceRequest->request_code}' enviada.", $actor,
            ['service_request_id' => $serviceRequest->id, 'organization_id' => $serviceRequest->organization_id],
        );

        return response()->json(['service_request' => $serviceRequest->fresh(['items', 'serviceStatus'])]);
    }

    /**
     * Transición a `CANCELLED` (D-S25: GENERATOR tiene control total,
     * alcanzable desde cualquier estado no-final). Exige `cancellation_reason_id`
     * (RN-SOL-009); si el motivo es `is_other=true`, exige además
     * `cancellation_details`.
     */
    public function cancel(Request $request, WasteServiceRequest $serviceRequest)
    {
        $actor = $request->user();
        abort_unless((new ServiceRequestPolicy)->cancel($actor, $serviceRequest), 403, 'No tiene acceso a esta solicitud de servicio.');

        $data = $request->validate([
            'cancellation_reason_id' => [
                'required', 'integer',
                Rule::exists('cancellation_reasons', 'id')->where('is_active', true)->whereNull('deleted_at'),
            ],
            'cancellation_details' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);

        $reason = CancellationReason::query()->findOrFail($data['cancellation_reason_id']);

        if ($reason->is_other && blank($data['cancellation_details'] ?? null)) {
            throw ValidationException::withMessages([
                'cancellation_details' => ['Debe indicar el detalle cuando el motivo de cancelación es "Otra razón".'],
            ]);
        }

        ServiceRequestApprovalService::transitionHeader($serviceRequest, $actor, 'CANCELLED');

        $serviceRequest->forceFill([
            'cancellation_reason_id' => $reason->id,
            'cancellation_details' => $data['cancellation_details'] ?? null,
            'cancelled_by' => $actor->id,
            'cancelled_at' => now(),
            'updated_by' => $actor->id,
        ])->save();

        $this->logSecurityEvent(
            $request, 'SERVICE_REQUEST_CANCELLED', 'SUCCESS',
            "Solicitud de servicio '{$serviceRequest->request_code}' cancelada: {$reason->name}.", $actor,
            ['service_request_id' => $serviceRequest->id, 'organization_id' => $serviceRequest->organization_id],
        );

        return response()->json(['service_request' => $serviceRequest->fresh(['serviceStatus', 'cancellationReason'])]);
    }

    /**
     * POST .../items/{item}/approve -- delega a
     * `ServiceRequestApprovalService`, autorizado SOLO al Gestor dueño de
     * ESE ítem específico (o platform staff).
     */
    public function approveItem(Request $request, WasteServiceRequestItem $item)
    {
        $actor = $request->user();
        abort_unless((new ServiceRequestPolicy)->evaluateItem($actor, $item), 403, 'No tiene permiso para evaluar este ítem.');

        $data = $request->validate(['notes' => ['sometimes', 'nullable', 'string', 'max:1000']]);

        $item = ServiceRequestApprovalService::approveItem($item, $actor, $data['notes'] ?? null);

        $this->logSecurityEvent(
            $request, 'SERVICE_REQUEST_ITEM_APPROVED', 'SUCCESS',
            "Ítem '{$item->id}' de la solicitud '{$item->service_request_id}' aprobado.", $actor,
            ['service_request_item_id' => $item->id, 'service_request_id' => $item->service_request_id, 'organization_id' => $item->wasteTreatmentApproval?->organization_id],
        );

        return response()->json(['item' => $item->fresh(['itemStatus', 'serviceRequest.serviceStatus'])]);
    }

    /**
     * POST .../items/{item}/reject -- mismo criterio que approveItem(), pero
     * exige `notes` (motivo de rechazo, mismo patrón que
     * `WasteTreatmentApprovalController::rejectTechnical()` exige
     * `technical_notes`).
     */
    public function rejectItem(Request $request, WasteServiceRequestItem $item)
    {
        $actor = $request->user();
        abort_unless((new ServiceRequestPolicy)->evaluateItem($actor, $item), 403, 'No tiene permiso para evaluar este ítem.');

        $data = $request->validate(['notes' => ['required', 'string', 'max:1000']]);

        $item = ServiceRequestApprovalService::rejectItem($item, $actor, $data['notes']);

        $this->logSecurityEvent(
            $request, 'SERVICE_REQUEST_ITEM_REJECTED', 'SUCCESS',
            "Ítem '{$item->id}' de la solicitud '{$item->service_request_id}' rechazado: {$data['notes']}", $actor,
            ['service_request_item_id' => $item->id, 'service_request_id' => $item->service_request_id, 'organization_id' => $item->wasteTreatmentApproval?->organization_id],
        );

        return response()->json(['item' => $item->fresh(['itemStatus', 'serviceRequest.serviceStatus'])]);
    }

    /**
     * @return array<int, array{waste: Waste, approval: WasteTreatmentApproval|null, data: array}>
     */
    private function resolveAndValidateItems(array $items, int $organizationId): array
    {
        $resolved = [];

        foreach ($items as $index => $itemData) {
            $waste = Waste::query()->find($itemData['waste_id']);

            if (! $waste || (int) $waste->organization_id !== $organizationId) {
                throw ValidationException::withMessages([
                    "items.{$index}.waste_id" => ['El residuo indicado no pertenece a su organización.'],
                ]);
            }

            $approval = null;

            if (! empty($itemData['waste_treatment_approval_id'])) {
                $approval = WasteTreatmentApproval::query()->find($itemData['waste_treatment_approval_id']);

                if (! $approval || (int) $approval->waste_id !== (int) $waste->id) {
                    throw ValidationException::withMessages([
                        "items.{$index}.waste_treatment_approval_id" => ['La aprobación de tratamiento indicada no corresponde a este residuo.'],
                    ]);
                }

                // Hallazgo Baja (especialista-seguridad, 2026-07-19): alineado con
                // Waste::hasViableTreatment()/scopeWithViableTreatment(), que YA
                // exigen is_active=true además de ambos ejes APPROVED -- esta
                // validación de "aprobación viable" al crear un ítem se había
                // quedado corta, permitiendo asignar una aprobación desactivada.
                if ($approval->technical_status !== 'APPROVED' || $approval->commercial_status !== 'APPROVED' || ! $approval->is_active) {
                    throw ValidationException::withMessages([
                        "items.{$index}.waste_treatment_approval_id" => ['La aprobación de tratamiento indicada no tiene ambos ejes (técnico y comercial) aprobados.'],
                    ]);
                }

                $this->assertCarteraNotBlocked($organizationId, $approval->organization_id, $index);
            }

            $resolved[$index] = ['waste' => $waste, 'approval' => $approval, 'data' => $itemData];
        }

        return $resolved;
    }

    /**
     * D-S04/D-S12: si existe una fila `organization_cartera_statuses`
     * ACTIVA para el par Generador<->Gestor de este ítem y su estado
     * bloquea nuevas solicitudes (`cartera_statuses.blocks_new_requests`),
     * rechaza la creación completa con 422.
     */
    private function assertCarteraNotBlocked(int $generatorOrganizationId, int $gestorOrganizationId, int $itemIndex): void
    {
        $carteraStatus = OrganizationCarteraStatus::query()
            ->where('generator_organization_id', $generatorOrganizationId)
            ->where('gestor_organization_id', $gestorOrganizationId)
            ->where('is_active', true)
            ->with('carteraStatus')
            ->first();

        if ($carteraStatus !== null && $carteraStatus->blocksNewRequests()) {
            throw ValidationException::withMessages([
                "items.{$itemIndex}.waste_treatment_approval_id" => ['No es posible crear solicitudes para este Gestor: el estado de cartera actual las bloquea.'],
            ]);
        }
    }

    private function assertOrganizationCanGenerateWaste(?int $organizationId): void
    {
        $organization = Organization::query()->find($organizationId);

        if (! $organization || ! $organization->hasCapability('can_generate_waste')) {
            throw ValidationException::withMessages([
                'organization_id' => ['Solo organizaciones Generador pueden crear solicitudes de servicio.'],
            ]);
        }
    }

    /**
     * Mismo helper conceptual que `WasteController::assertBranchBelongsToOrganization()`.
     */
    private function assertBranchBelongsToOrganization(int $branchId, ?int $organizationId): void
    {
        $branch = Branch::withTrashed()->find($branchId);

        if ($branch && (int) $branch->organization_id !== (int) $organizationId) {
            throw ValidationException::withMessages([
                'branch_id' => ['La sede indicada no pertenece a la organización de la solicitud.'],
            ]);
        }
    }

    /**
     * `waste_service_requests.request_code` es NOT NULL UNIQUE sin
     * mecanismo de generación confirmado por ninguna spec fuente (D-S) --
     * se genera server-side con un sufijo aleatorio y se reintenta ante una
     * colisión improbable, mismo criterio de "nunca aceptar del cliente" que
     * el resto de columnas server-derivadas del proyecto. Señalado como
     * decisión de diseño no especificada en el resumen de la tarea.
     */
    private function generateRequestCode(int $organizationId): string
    {
        do {
            $code = sprintf('SR-%d-%s', $organizationId, Str::upper(Str::random(8)));
        } while (WasteServiceRequest::withTrashed()->where('request_code', $code)->exists());

        return $code;
    }

    /**
     * @param  class-string<\Illuminate\Database\Eloquent\Model>  $modelClass
     */
    private function defaultCatalogId(string $modelClass, string $code, array $extraWhere = []): int
    {
        $query = $modelClass::query()->where('code', $code);

        foreach ($extraWhere as $column => $value) {
            $query->where($column, $value);
        }

        $id = $query->value('id');

        if ($id === null) {
            throw new \LogicException("Catálogo {$modelClass} sin el valor '{$code}' sembrado.");
        }

        return $id;
    }

    private function headerValidationRules(bool $sometimes = false): array
    {
        $required = $sometimes ? 'sometimes' : 'required';

        return [
            'branch_id' => [$required, 'integer', 'exists:branches,id'],
            'requested_collection_date' => ['sometimes', 'nullable', 'date'],
            'estimated_ready_date' => ['sometimes', 'nullable', 'date'],
            'scheduled_collection_date' => ['sometimes', 'nullable', 'date'],
            'estimated_total_weight' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'estimated_total_volume' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'measurement_unit_id' => ['sometimes', 'nullable', 'integer', 'exists:measurement_units,id'],
            'packaging_type' => ['sometimes', 'nullable', 'string', 'max:100'],
            'requires_lift_platform' => ['sometimes', 'boolean'],
            'requires_audit' => ['sometimes', 'boolean'],
            'requires_photo_record' => ['sometimes', 'boolean'],
            'requires_container_return' => ['sometimes', 'boolean'],
            'estimated_height' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'estimated_width' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'estimated_length' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'observations' => ['sometimes', 'nullable', 'string'],
            'request_source' => ['sometimes', 'string', 'max:30'],
            'priority' => ['sometimes', 'string', 'max:20'],
            'requested_by' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'metadata' => ['sometimes', 'nullable', 'array'],
        ];
    }

    private function itemValidationRules(): array
    {
        return [
            'items' => ['required', 'array', 'min:1', 'max:100'],
            'items.*.waste_id' => ['required', 'integer', 'exists:wastes,id'],
            'items.*.waste_treatment_approval_id' => ['sometimes', 'nullable', 'integer', 'exists:waste_treatment_approvals,id'],
            'items.*.estimated_quantity' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'items.*.actual_quantity' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'items.*.estimated_weight' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'items.*.actual_weight' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'items.*.measurement_unit_id' => ['sometimes', 'nullable', 'integer', 'exists:measurement_units,id'],
            'items.*.packaging_type' => ['sometimes', 'nullable', 'string', 'max:100'],
            'items.*.physical_state_id' => ['sometimes', 'nullable', 'integer', 'exists:physical_states,id'],
            'items.*.is_stackable' => ['sometimes', 'boolean'],
            'items.*.requires_forklift' => ['sometimes', 'boolean'],
            'items.*.requires_isolation' => ['sometimes', 'boolean'],
            'items.*.height' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'items.*.width' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'items.*.length' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'items.*.calculated_volume' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'items.*.observations' => ['sometimes', 'nullable', 'string'],
            'items.*.metadata' => ['sometimes', 'nullable', 'array'],
        ];
    }
}
