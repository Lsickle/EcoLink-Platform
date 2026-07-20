<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Concerns\LogsSecurityEvents;
use App\Http\Controllers\Controller;
use App\Models\TransportPersonnel;
use App\Models\UnloadRequest;
use App\Models\UnloadRequestItem;
use App\Models\UnloadRequestStatus;
use App\Models\Vehicle;
use App\Policies\UnloadRequestPolicy;
use App\Services\UnloadRequestWorkflowService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Fase 4 "Cita de Recepción en Planta (bilateral)" -- `unload_requests`.
 * Gobernada por el motor de Workflow genérico (`entity_type=TRANSPORT`, ver
 * docblock de `UnloadRequestWorkflowSeeder`). Grafo cubierto:
 *   Draft ->(submit)-> Submitted ->(approve)-> Approved
 *                                ->(reject)-> Rejected
 *
 * La INMENSA mayoría de las filas nacen AUTOMÁTICAMENTE al confirmar una
 * `transport_schedules` (D-PRG-13, `UnloadRequestAutomationService`,
 * disparada desde `TransportScheduleController::confirm()`) -- YA en estado
 * `Submitted` (ver docblock de esa clase para el razonamiento). `store()`
 * cubre el caso "anticipada" (D-RCP): creación MANUAL cuando
 * `manifest_load_id`/`transport_schedule_id` todavía no existen -- nace en
 * `Draft`, requiere `submit()` explícito.
 *
 * Acceso DUAL NO simétrico (ver `UnloadRequestPolicy`): el lado
 * TRANSPORTADOR (carrier) crea/envía; el lado RECEPTOR decide
 * (Aprobar/Rechazar).
 */
class UnloadRequestController extends Controller
{
    use LogsSecurityEvents;

    public function index(Request $request)
    {
        $actor = $request->user();
        abort_unless((new UnloadRequestPolicy)->viewAny($actor), 403, 'No tiene permiso para consultar solicitudes de descargue.');

        $search = $request->input('search');
        $statusCode = $request->input('status');
        $receivingBranchId = $request->input('receiving_branch_id');

        $unloadRequests = UnloadRequest::query()
            ->when(! $actor->isPlatformStaff(), function ($query) use ($actor) {
                // Hallazgo ALTO (especialista-seguridad, 2026-07-20): sin este guard,
                // un actor con `tenant_organization_id=NULL` (estado legítimo, ver
                // `ServiceRequestPolicy::view()` -- "usuarios sin tenant asignado
                // forman su propio grupo") produce `where('carrier_organization_id',
                // null)`, que Eloquent traduce a `IS NULL`. Como
                // `carrier_organization_id` es NULLABLE (caso autotransporte/
                // anticipada sin transportador asignado, D-PRG-02), ese actor vería
                // TODAS las filas de CUALQUIER organización con ese campo en NULL --
                // fuga cross-tenant real. Se fuerza lista vacía en vez de comparar
                // contra NULL.
                if ($actor->tenant_organization_id === null) {
                    $query->whereRaw('1 = 0');

                    return;
                }

                $query->where(function ($query) use ($actor) {
                    $query->where('carrier_organization_id', $actor->tenant_organization_id)
                        ->orWhereHas('receivingBranch', fn ($query) => $query->where('organization_id', $actor->tenant_organization_id));
                });
            })
            ->when($receivingBranchId, fn ($query) => $query->where('receiving_branch_id', $receivingBranchId))
            ->when($search, fn ($query) => $query->where('request_number', 'ILIKE', "%{$search}%"))
            ->when($statusCode, function ($query) use ($statusCode) {
                $query->whereHas('unloadRequestStatus', fn ($query) => $query->where('code', $statusCode));
            })
            ->with(['unloadRequestStatus', 'receivingBranch:id,name,organization_id', 'carrierOrganization:id,legal_name', 'transportSchedule:id,schedule_number'])
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 15));

        return response()->json($unloadRequests);
    }

    public function show(Request $request, UnloadRequest $unloadRequest)
    {
        abort_unless((new UnloadRequestPolicy)->view($request->user(), $unloadRequest), 403, 'No tiene acceso a esta solicitud de descargue.');

        $unloadRequest->load([
            'unloadRequestStatus',
            'receivingBranch:id,name,organization_id',
            'manifestLoad:id,manifest_number',
            'transportSchedule:id,schedule_number,organization_id',
            'originBranch:id,name,organization_id',
            'carrierOrganization:id,legal_name',
            'vehicle',
            'transportPersonnel.person',
            'items.waste:id,name,code',
            'activeReceptionSchedule',
        ]);

        return response()->json(['unload_request' => $unloadRequest]);
    }

    /**
     * Creación MANUAL -- caso "anticipada" (D-RCP: `manifest_load_id`/
     * `transport_schedule_id` ambos NULL, nunca aceptados del payload).
     * Nace en `Draft`.
     */
    public function store(Request $request)
    {
        $actor = $request->user();

        // Anti-role-smuggling (mismo criterio que TransportScheduleController::store()):
        // un tenant admin SIEMPRE crea desde SU propia organización.
        $carrierOrganizationId = $actor->isPlatformStaff()
            ? $request->integer('carrier_organization_id')
            : $actor->tenant_organization_id;

        abort_unless((new UnloadRequestPolicy)->create($actor), 403, 'No tiene permiso para crear solicitudes de descargue.');

        $rules = array_merge($this->headerValidationRules(), $this->itemValidationRules());

        if ($actor->isPlatformStaff()) {
            $rules['carrier_organization_id'] = ['required', 'integer', 'exists:organizations,id'];
        }

        $data = $request->validate($rules);

        if (array_key_exists('vehicle_id', $data) && $data['vehicle_id'] !== null) {
            $this->assertVehicleBelongsToOrganization((int) $data['vehicle_id'], $carrierOrganizationId);
        }

        if (array_key_exists('transport_personnel_id', $data) && $data['transport_personnel_id'] !== null) {
            $this->assertTransportPersonnelBelongsToOrganization((int) $data['transport_personnel_id'], $carrierOrganizationId);
        }

        $items = $data['items'];
        unset($data['items'], $data['carrier_organization_id']);

        $draftStatusId = $this->defaultStatusId('DRAFT');

        $unloadRequest = DB::transaction(function () use ($data, $carrierOrganizationId, $actor, $items, $draftStatusId) {
            $data['tenant_organization_id'] = $carrierOrganizationId;
            $data['carrier_organization_id'] = $carrierOrganizationId;
            $data['request_number'] = $this->generateRequestNumber($carrierOrganizationId);
            $data['manifest_load_id'] = null;
            $data['transport_schedule_id'] = null;
            $data['is_active'] = true;

            $unloadRequest = new UnloadRequest;
            $unloadRequest->fill($data);
            $unloadRequest->forceFill([
                'unload_request_status_id' => $draftStatusId,
                'created_by' => $actor->id,
                'updated_by' => $actor->id,
            ]);
            $unloadRequest->save();

            foreach ($items as $index => $itemData) {
                UnloadRequestItem::query()->create([
                    'tenant_organization_id' => $unloadRequest->tenant_organization_id,
                    'unload_request_id' => $unloadRequest->id,
                    'manifest_load_item_id' => null,
                    'waste_id' => $itemData['waste_id'],
                    'requested_quantity' => $itemData['requested_quantity'],
                    'unit_of_measure' => $itemData['unit_of_measure'] ?? 'KG',
                    'packaging_type' => $itemData['packaging_type'] ?? null,
                    'line_number' => $index + 1,
                    'is_active' => true,
                ]);
            }

            return $unloadRequest;
        });

        $this->logSecurityEvent(
            $request, 'UNLOAD_REQUEST_CREATED', 'SUCCESS',
            "Solicitud de descargue '{$unloadRequest->request_number}' creada.", $actor,
            ['unload_request_id' => $unloadRequest->id, 'carrier_organization_id' => $carrierOrganizationId],
        );

        return response()->json(['unload_request' => $unloadRequest->fresh(['items', 'unloadRequestStatus', 'receivingBranch:id,name,organization_id'])], 201);
    }

    /**
     * DRAFT -> SUBMITTED (lado transportador).
     */
    public function submit(Request $request, UnloadRequest $unloadRequest)
    {
        $actor = $request->user();
        abort_unless((new UnloadRequestPolicy)->manage($actor, $unloadRequest), 403, 'No tiene acceso a esta solicitud de descargue.');

        if ($unloadRequest->unloadRequestStatus?->code !== 'DRAFT') {
            throw ValidationException::withMessages([
                'unload_request_status' => ['Solo se puede enviar una solicitud en estado Borrador.'],
            ]);
        }

        $unloadRequest = UnloadRequestWorkflowService::transition($unloadRequest, $actor, 'SUBMITTED');

        $this->logSecurityEvent(
            $request, 'UNLOAD_REQUEST_SUBMITTED', 'SUCCESS',
            "Solicitud de descargue '{$unloadRequest->request_number}' enviada.", $actor,
            ['unload_request_id' => $unloadRequest->id],
        );

        return response()->json(['unload_request' => $unloadRequest->fresh(['unloadRequestStatus'])]);
    }

    /**
     * SUBMITTED -> APPROVED (lado receptor, RN-RCP-015 habilita el paso
     * siguiente -- proponer la cita, ver `PlantReceptionScheduleController`).
     */
    public function approve(Request $request, UnloadRequest $unloadRequest)
    {
        $actor = $request->user();
        abort_unless((new UnloadRequestPolicy)->decide($actor, $unloadRequest), 403, 'No tiene acceso a esta solicitud de descargue.');

        if ($unloadRequest->unloadRequestStatus?->code !== 'SUBMITTED') {
            throw ValidationException::withMessages([
                'unload_request_status' => ['Solo se puede aprobar una solicitud en estado Enviada.'],
            ]);
        }

        $unloadRequest = UnloadRequestWorkflowService::transition($unloadRequest, $actor, 'APPROVED');

        $this->logSecurityEvent(
            $request, 'UNLOAD_REQUEST_APPROVED', 'SUCCESS',
            "Solicitud de descargue '{$unloadRequest->request_number}' aprobada.", $actor,
            ['unload_request_id' => $unloadRequest->id],
        );

        return response()->json(['unload_request' => $unloadRequest->fresh(['unloadRequestStatus'])]);
    }

    /**
     * SUBMITTED -> REJECTED (lado receptor).
     */
    public function reject(Request $request, UnloadRequest $unloadRequest)
    {
        $actor = $request->user();
        abort_unless((new UnloadRequestPolicy)->decide($actor, $unloadRequest), 403, 'No tiene acceso a esta solicitud de descargue.');

        if ($unloadRequest->unloadRequestStatus?->code !== 'SUBMITTED') {
            throw ValidationException::withMessages([
                'unload_request_status' => ['Solo se puede rechazar una solicitud en estado Enviada.'],
            ]);
        }

        $data = $request->validate([
            'rejection_reason' => ['required', 'string', 'max:1000'],
        ]);

        $unloadRequest = UnloadRequestWorkflowService::transition($unloadRequest, $actor, 'REJECTED');
        $unloadRequest->forceFill(['rejection_reason' => $data['rejection_reason']])->save();

        $this->logSecurityEvent(
            $request, 'UNLOAD_REQUEST_REJECTED', 'SUCCESS',
            "Solicitud de descargue '{$unloadRequest->request_number}' rechazada.", $actor,
            ['unload_request_id' => $unloadRequest->id],
        );

        return response()->json(['unload_request' => $unloadRequest->fresh(['unloadRequestStatus'])]);
    }

    private function assertVehicleBelongsToOrganization(int $vehicleId, ?int $organizationId): void
    {
        $vehicle = Vehicle::withTrashed()->find($vehicleId);

        if ($vehicle && (int) $vehicle->organization_id !== (int) $organizationId) {
            throw ValidationException::withMessages([
                'vehicle_id' => ['El vehículo indicado no pertenece a su organización.'],
            ]);
        }
    }

    private function assertTransportPersonnelBelongsToOrganization(int $transportPersonnelId, ?int $organizationId): void
    {
        $personnel = TransportPersonnel::withTrashed()->find($transportPersonnelId);

        if ($personnel && (int) $personnel->organization_id !== (int) $organizationId) {
            throw ValidationException::withMessages([
                'transport_personnel_id' => ['El conductor indicado no pertenece a su organización.'],
            ]);
        }
    }

    private function defaultStatusId(string $code): int
    {
        $id = UnloadRequestStatus::query()->where('code', $code)->value('id');

        if ($id === null) {
            throw new \LogicException("Catálogo unload_request_statuses sin el valor '{$code}' sembrado.");
        }

        return $id;
    }

    private function generateRequestNumber(int $carrierOrganizationId): string
    {
        do {
            $code = sprintf('SOL-%d-%s', $carrierOrganizationId, Str::upper(Str::random(8)));
        } while (UnloadRequest::withTrashed()->where('tenant_organization_id', $carrierOrganizationId)->where('request_number', $code)->exists());

        return $code;
    }

    private function headerValidationRules(): array
    {
        return [
            'receiving_branch_id' => ['required', 'integer', 'exists:branches,id'],
            'origin_branch_id' => ['sometimes', 'nullable', 'integer', 'exists:branches,id'],
            'vehicle_id' => ['sometimes', 'nullable', 'integer', 'exists:vehicles,id'],
            'transport_personnel_id' => ['sometimes', 'nullable', 'integer', 'exists:transport_personnel,id'],
            'service_modality' => ['sometimes', 'string', 'in:'.UnloadRequest::MODALITY_COLLECTION.','.UnloadRequest::MODALITY_SELF_TRANSPORT],
            'estimated_arrival_at' => ['sometimes', 'nullable', 'date'],
            'priority' => ['sometimes', 'string', 'max:20'],
            'metadata' => ['sometimes', 'nullable', 'array'],
        ];
    }

    private function itemValidationRules(): array
    {
        return [
            'items' => ['required', 'array', 'min:1', 'max:100'],
            'items.*.waste_id' => ['required', 'integer', 'exists:wastes,id'],
            'items.*.requested_quantity' => ['required', 'numeric', 'min:0'],
            'items.*.unit_of_measure' => ['sometimes', 'nullable', 'string', 'max:20'],
            'items.*.packaging_type' => ['sometimes', 'nullable', 'string', 'max:100'],
        ];
    }
}
