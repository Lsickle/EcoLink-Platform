<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Concerns\LogsSecurityEvents;
use App\Http\Controllers\Controller;
use App\Models\ManifestLoad;
use App\Models\ManifestStatus;
use App\Models\ManifestUnload;
use App\Models\ManifestUnloadItem;
use App\Models\Person;
use App\Models\PlantReceptionSchedule;
use App\Models\UnloadRequest;
use App\Policies\ManifestUnloadPolicy;
use App\Services\ManifestUnloadSignatureService;
use App\Services\ManifestUnloadWorkflowService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Módulo Manifiesto de Descargue, Fase 5 (última fase del plan) -- el
 * documento/registro que se genera y firma en la planta del Gestor AL
 * DESCARGAR los residuos transportados, con firmas del receptor y del
 * conductor y registro de cantidades recibidas/rechazadas por residuo.
 * Gobernado por el motor de Workflow genérico (`entity_type=MANIFEST`,
 * workflow PROPIO "MANIFEST_UNLOAD", ver `ManifestUnloadWorkflowSeeder`).
 *
 * Grafo cubierto por ESTE controller:
 *   Draft ->(generate)-> Generated ->(sign, automático)-> PartiallySigned
 *   ->(sign, automático)-> Signed ->(complete)-> Closed
 *   Cancelled alcanzable SOLO desde Generated/PartiallySigned.
 * A diferencia de `manifest_loads` (Fase 3, se detenía en InTransit):
 * `manifest_unloads` SÍ cierra el ciclo completo hasta Closed -- es el
 * último eslabón.
 *
 * `store()` parte de una `unload_requests` YA `Approved` con una
 * `plant_reception_schedules` activa `Confirmed` (el ciclo completo de Fase
 * 4 ya cerrado) -- deriva AUTOMÁTICAMENTE `receiving_branch_id`/
 * `receiving_organization_id`/`vehicle_id`/`transport_personnel_id`/
 * `driver_signer_person_id` de esa cadena. Solo `receiver_person_id` se
 * elige a mano (anti-IDOR: debe pertenecer a la organización RECEPTORA,
 * la MISMA organización del actor que crea el manifiesto -- a diferencia de
 * Fase 3, aquí no hace falta una búsqueda cross-organización). `manifest_load_id`
 * se propaga automáticamente si existe uno ACTIVO para la programación de
 * transporte subyacente (D-PRG-05); si no, queda NULL (autotransporte sin
 * cargue formal).
 *
 * `manifest_unload_items` se derivan, una línea por cada
 * `unload_request_item` vinculado, con cantidades declaradas en CERO -- se
 * editan en `inspectItems()` (inspección física del receptor) ANTES de
 * poder `generate()` el manifiesto.
 *
 * RN-107/108 (interpretación de esta tarea -- FLAG explícito, ver resumen
 * final: no se tuvo acceso al texto literal de estas reglas en este
 * entorno): se implementa como guarda de `generate()` que exige que los
 * pesos recibidos/rechazados AGREGADOS de cabecera
 * (`received_total_weight_kg`/`rejected_total_weight_kg`) ya hayan sido
 * registrados por `inspectItems()` -- no se puede generar el manifiesto
 * sobre una inspección todavía sin completar.
 */
class ManifestUnloadController extends Controller
{
    use LogsSecurityEvents;

    public function index(Request $request)
    {
        $actor = $request->user();
        abort_unless((new ManifestUnloadPolicy)->viewAny($actor), 403, 'No tiene permiso para consultar manifiestos de descargue.');

        $organizationId = $request->input('organization_id');
        $search = $request->input('search');
        $statusCode = $request->input('status');

        $manifests = ManifestUnload::query()
            ->when(! $actor->isPlatformStaff(), function ($query) use ($actor) {
                $query->where(function ($query) use ($actor) {
                    $query->where('receiving_organization_id', $actor->tenant_organization_id)
                        ->orWhereHas('unloadRequest', fn ($query) => $query->where('carrier_organization_id', $actor->tenant_organization_id));
                });
            })
            ->when($actor->isPlatformStaff() && $organizationId, fn ($query) => $query->where('receiving_organization_id', $organizationId))
            ->when($search, fn ($query) => $query->where('manifest_number', 'ILIKE', "%{$search}%"))
            ->when($statusCode, function ($query) use ($statusCode) {
                $query->whereHas('manifestStatus', fn ($query) => $query->where('code', $statusCode));
            })
            ->with(['manifestStatus', 'unloadRequest:id,request_number', 'receivingOrganization:id,legal_name', 'receivingBranch:id,name,organization_id', 'vehicle:id,plate_number'])
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 15));

        return response()->json($manifests);
    }

    public function show(Request $request, ManifestUnload $manifestUnload)
    {
        $actor = $request->user();
        abort_unless((new ManifestUnloadPolicy)->view($actor, $manifestUnload), 403, 'No tiene acceso a este manifiesto de descargue.');

        $manifestUnload->load([
            'manifestStatus',
            'manifestLoad:id,manifest_number',
            'unloadRequest:id,request_number,carrier_organization_id',
            'receivingBranch:id,name,organization_id',
            'receivingOrganization:id,legal_name',
            'vehicle',
            'transportPersonnel.person',
            'receiverPerson',
            'driverSignerPerson',
            'items.waste:id,name,code',
            'items.storageLocation:id,name',
        ]);

        return response()->json(['manifest_unload' => $manifestUnload]);
    }

    /**
     * Crea la cabecera (estado inicial `manifest_status_id=DRAFT`) +
     * `manifest_unload_items` derivados de la `unload_request_id`, en una
     * única transacción. Ver el docblock completo de la clase.
     */
    public function store(Request $request)
    {
        $actor = $request->user();

        $data = $request->validate([
            'unload_request_id' => ['required', 'integer', 'exists:unload_requests,id'],
            'receiver_person_id' => ['required', 'integer', 'exists:people,id'],
            'unload_date' => ['sometimes', 'nullable', 'date'],
            'observations' => ['sometimes', 'nullable', 'string'],
        ]);

        $unloadRequest = UnloadRequest::query()
            ->with(['unloadRequestStatus', 'activeReceptionSchedule', 'transportPersonnel', 'items'])
            ->findOrFail($data['unload_request_id']);

        abort_unless((new ManifestUnloadPolicy)->create($actor, $unloadRequest), 403, 'No tiene permiso para crear un manifiesto de descargue para esta solicitud.');

        $this->assertUnloadRequestReadyForUnload($unloadRequest);

        $receivingOrganizationId = $unloadRequest->receivingOrganizationId();
        $this->assertPersonBelongsToOrganization((int) $data['receiver_person_id'], $receivingOrganizationId);

        if ($unloadRequest->vehicle_id === null || $unloadRequest->transport_personnel_id === null || $unloadRequest->transportPersonnel?->person_id === null) {
            throw ValidationException::withMessages([
                'unload_request_id' => ['La solicitud de descargue no tiene vehículo/conductor asignado todavía -- no se puede generar el manifiesto de descargue.'],
            ]);
        }

        $draftStatusId = $this->defaultManifestStatusId('DRAFT');

        // Hallazgo Medio de Fase 3, replicado aquí (ver docblock de la
        // migración `create_manifest_unloads_table`): pre-chequeo de
        // aplicación ANTES de tocar la BD -- la condición de carrera real la
        // cubre el índice único parcial `manifest_unloads_active_unique` +
        // el try/catch de abajo.
        if ($this->manifestAlreadyActiveForRequest($unloadRequest->id)) {
            throw ValidationException::withMessages([
                'unload_request_id' => ['Ya existe un manifiesto de descargue activo para esta solicitud. Cancele el manifiesto anterior antes de crear uno de reemplazo.'],
            ]);
        }

        try {
            $manifestUnload = DB::transaction(function () use ($data, $unloadRequest, $receivingOrganizationId, $draftStatusId) {
                $manifestUnload = new ManifestUnload;
                $manifestUnload->fill([
                    'tenant_organization_id' => $receivingOrganizationId,
                    'manifest_number' => $this->generateManifestNumber($receivingOrganizationId),
                    'manifest_load_id' => $this->resolveManifestLoadId($unloadRequest),
                    'unload_request_id' => $unloadRequest->id,
                    'receiving_branch_id' => $unloadRequest->receiving_branch_id,
                    'receiving_organization_id' => $receivingOrganizationId,
                    'vehicle_id' => $unloadRequest->vehicle_id,
                    'transport_personnel_id' => $unloadRequest->transport_personnel_id,
                    'unload_date' => $data['unload_date'] ?? now()->toDateString(),
                    'receiver_person_id' => $data['receiver_person_id'],
                    // Transportador SIEMPRE derivado de la unload_request -- ver docblock de la clase.
                    'driver_signer_person_id' => $unloadRequest->transportPersonnel->person_id,
                    'observations' => $data['observations'] ?? null,
                    'is_active' => true,
                ]);
                // `manifest_status_id` se retira del $fillable -- ver docblock del modelo.
                $manifestUnload->forceFill(['manifest_status_id' => $draftStatusId]);
                $manifestUnload->save();

                foreach ($unloadRequest->items as $index => $requestItem) {
                    ManifestUnloadItem::query()->create([
                        'tenant_organization_id' => $manifestUnload->tenant_organization_id,
                        'manifest_unload_id' => $manifestUnload->id,
                        'manifest_load_item_id' => $requestItem->manifest_load_item_id,
                        'unload_request_item_id' => $requestItem->id,
                        'waste_id' => $requestItem->waste_id,
                        'received_quantity' => 0,
                        'rejected_quantity' => 0,
                        'unit_of_measure' => $requestItem->unit_of_measure ?? 'KG',
                        'line_number' => $requestItem->line_number ?? ($index + 1),
                        'is_active' => true,
                    ]);
                }

                return $manifestUnload;
            });
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages([
                'unload_request_id' => ['Ya existe un manifiesto de descargue activo para esta solicitud. Intente nuevamente.'],
            ]);
        }

        $this->logSecurityEvent(
            $request, 'MANIFEST_UNLOAD_CREATED', 'SUCCESS',
            "Manifiesto de descargue '{$manifestUnload->manifest_number}' creado.", $actor,
            ['manifest_unload_id' => $manifestUnload->id, 'receiving_organization_id' => $receivingOrganizationId],
        );

        return response()->json(['manifest_unload' => $manifestUnload->fresh(['items', 'manifestStatus', 'receivingOrganization:id,legal_name', 'vehicle', 'transportPersonnel'])], 201);
    }

    /**
     * Inspección física del receptor -- ANTES de `generate()`. Edita las
     * cantidades recibidas/rechazadas por línea + los totales agregados de
     * cabecera (RN-107/108, ver docblock de la clase).
     */
    public function inspectItems(Request $request, ManifestUnload $manifestUnload)
    {
        $actor = $request->user();
        abort_unless((new ManifestUnloadPolicy)->manage($actor, $manifestUnload), 403, 'No tiene acceso a este manifiesto de descargue.');

        if ($manifestUnload->manifestStatus?->code !== 'DRAFT') {
            throw ValidationException::withMessages([
                'manifest_status' => ['Solo se puede inspeccionar un manifiesto en estado Borrador.'],
            ]);
        }

        $data = $request->validate([
            'received_total_weight_kg' => ['required', 'numeric', 'min:0'],
            'rejected_total_weight_kg' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'received_total_volume_m3' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'received_as_expected' => ['sometimes', 'boolean'],
            'unload_started_at' => ['sometimes', 'nullable', 'date'],
            'unload_completed_at' => ['sometimes', 'nullable', 'date'],
            'incidents' => ['sometimes', 'nullable', 'string'],
            'observations' => ['sometimes', 'nullable', 'string'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.id' => [
                'required', 'integer',
                Rule::exists('manifest_unload_items', 'id')->where('manifest_unload_id', $manifestUnload->id),
            ],
            'items.*.received_quantity' => ['required', 'numeric', 'min:0'],
            'items.*.rejected_quantity' => ['sometimes', 'numeric', 'min:0'],
            'items.*.received_weight_kg' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'items.*.rejected_weight_kg' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'items.*.received_volume_m3' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'items.*.received_container_quantity' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'items.*.reception_condition' => ['sometimes', 'string', 'max:50'],
            'items.*.rejection_reason' => ['sometimes', 'nullable', 'string'],
            'items.*.inspection_approved' => ['sometimes', 'boolean'],
            'items.*.storage_location_id' => ['sometimes', 'nullable', 'integer', 'exists:branch_locations,id'],
            'items.*.observations' => ['sometimes', 'nullable', 'string'],
        ]);

        DB::transaction(function () use ($manifestUnload, $data) {
            foreach ($data['items'] as $itemData) {
                $item = ManifestUnloadItem::query()
                    ->where('manifest_unload_id', $manifestUnload->id)
                    ->findOrFail($itemData['id']);

                $item->fill(collect($itemData)->except('id')->toArray());
                $item->save();
            }

            $manifestUnload->forceFill([
                'received_total_weight_kg' => $data['received_total_weight_kg'],
                'rejected_total_weight_kg' => $data['rejected_total_weight_kg'] ?? 0,
                'received_total_volume_m3' => $data['received_total_volume_m3'] ?? null,
                'received_as_expected' => $data['received_as_expected'] ?? $manifestUnload->received_as_expected,
                'unload_started_at' => $data['unload_started_at'] ?? $manifestUnload->unload_started_at,
                'unload_completed_at' => $data['unload_completed_at'] ?? $manifestUnload->unload_completed_at,
                'incidents' => $data['incidents'] ?? $manifestUnload->incidents,
                'observations' => $data['observations'] ?? $manifestUnload->observations,
            ])->save();
        });

        $this->logSecurityEvent(
            $request, 'MANIFEST_UNLOAD_INSPECTED', 'SUCCESS',
            "Manifiesto de descargue '{$manifestUnload->manifest_number}' inspeccionado.", $actor,
            ['manifest_unload_id' => $manifestUnload->id],
        );

        return response()->json(['manifest_unload' => $manifestUnload->fresh(['items', 'manifestStatus'])]);
    }

    /**
     * Draft -> Generated (rol LOGÍSTICA, lado receptor). RN-107/108: exige
     * que la inspección ya haya registrado los pesos agregados de cabecera.
     */
    public function generate(Request $request, ManifestUnload $manifestUnload)
    {
        $actor = $request->user();
        abort_unless((new ManifestUnloadPolicy)->manage($actor, $manifestUnload), 403, 'No tiene acceso a este manifiesto de descargue.');

        if ($manifestUnload->manifestStatus?->code !== 'DRAFT') {
            throw ValidationException::withMessages([
                'manifest_status' => ['Solo se puede generar un manifiesto en estado Borrador.'],
            ]);
        }

        if ($manifestUnload->received_total_weight_kg === null) {
            throw ValidationException::withMessages([
                'received_total_weight_kg' => ['No puede generarse el manifiesto sin registrar los pesos recibidos/rechazados de la inspección (RN-107/108).'],
            ]);
        }

        $manifestUnload = ManifestUnloadWorkflowService::transition($manifestUnload, $actor, 'GENERATED');

        $this->logSecurityEvent(
            $request, 'MANIFEST_UNLOAD_GENERATED', 'SUCCESS',
            "Manifiesto de descargue '{$manifestUnload->manifest_number}' generado.", $actor,
            ['manifest_unload_id' => $manifestUnload->id, 'receiving_organization_id' => $manifestUnload->receiving_organization_id],
        );

        return response()->json(['manifest_unload' => $manifestUnload->fresh(['manifestStatus'])]);
    }

    /**
     * Firma como receptor o conductor (`ManifestUnloadSignatureService::sign()`).
     */
    public function sign(Request $request, ManifestUnload $manifestUnload)
    {
        $actor = $request->user();
        abort_unless((new ManifestUnloadPolicy)->sign($actor, $manifestUnload), 403, 'No tiene acceso a este manifiesto de descargue.');

        $data = $request->validate([
            'signer_type' => ['required', 'string', Rule::in([
                ManifestUnloadSignatureService::SIGNER_RECEIVER,
                ManifestUnloadSignatureService::SIGNER_DRIVER,
            ])],
        ]);

        $manifestUnload = ManifestUnloadSignatureService::sign($manifestUnload, $actor, $data['signer_type']);

        $this->logSecurityEvent(
            $request, 'MANIFEST_UNLOAD_SIGNED', 'SUCCESS',
            "Manifiesto de descargue '{$manifestUnload->manifest_number}' firmado ({$data['signer_type']}).", $actor,
            ['manifest_unload_id' => $manifestUnload->id, 'signer_type' => $data['signer_type']],
        );

        return response()->json(['manifest_unload' => $manifestUnload->fresh(['manifestStatus'])]);
    }

    /**
     * Signed -> Closed -- cierre del ciclo completo (último eslabón del
     * plan). Guarda EXPLÍCITA (equivalente a RN-193 de Fase 3) además de la
     * que ya impone el motor de Workflow.
     */
    public function complete(Request $request, ManifestUnload $manifestUnload)
    {
        $actor = $request->user();
        abort_unless((new ManifestUnloadPolicy)->manage($actor, $manifestUnload), 403, 'No tiene acceso a este manifiesto de descargue.');

        if ($manifestUnload->manifestStatus?->code !== 'SIGNED'
            || $manifestUnload->receiver_signed_at === null
            || $manifestUnload->driver_signed_at === null) {
            throw ValidationException::withMessages([
                'manifest_status' => ['No puede cerrarse el manifiesto sin que ambas firmas (receptor y conductor) estén completas.'],
            ]);
        }

        $manifestUnload = ManifestUnloadWorkflowService::transition($manifestUnload, $actor, 'CLOSED');

        $this->logSecurityEvent(
            $request, 'MANIFEST_UNLOAD_CLOSED', 'SUCCESS',
            "Manifiesto de descargue '{$manifestUnload->manifest_number}' cerrado.", $actor,
            ['manifest_unload_id' => $manifestUnload->id, 'receiving_organization_id' => $manifestUnload->receiving_organization_id],
        );

        return response()->json(['manifest_unload' => $manifestUnload->fresh(['manifestStatus'])]);
    }

    /**
     * -> Cancelled, alcanzable SOLO desde Generated/PartiallySigned.
     */
    public function cancel(Request $request, ManifestUnload $manifestUnload)
    {
        $actor = $request->user();
        abort_unless((new ManifestUnloadPolicy)->cancel($actor, $manifestUnload), 403, 'No tiene acceso a este manifiesto de descargue.');

        $manifestUnload = ManifestUnloadWorkflowService::transition($manifestUnload, $actor, 'CANCELLED');

        $this->logSecurityEvent(
            $request, 'MANIFEST_UNLOAD_CANCELLED', 'SUCCESS',
            "Manifiesto de descargue '{$manifestUnload->manifest_number}' cancelado.", $actor,
            ['manifest_unload_id' => $manifestUnload->id, 'receiving_organization_id' => $manifestUnload->receiving_organization_id],
        );

        return response()->json(['manifest_unload' => $manifestUnload->fresh(['manifestStatus'])]);
    }

    /**
     * Decisión #4 del enunciado de esta tarea: la `unload_request` debe estar
     * `Approved` y su franja de recepción (`activeReceptionSchedule`)
     * `Confirmed` -- el ciclo completo de Fase 4 ya cerrado.
     */
    private function assertUnloadRequestReadyForUnload(UnloadRequest $unloadRequest): void
    {
        if ($unloadRequest->unloadRequestStatus?->code !== 'APPROVED') {
            throw ValidationException::withMessages([
                'unload_request_id' => ['Solo se puede generar un manifiesto de descargue para una solicitud Aprobada.'],
            ]);
        }

        $schedule = $unloadRequest->activeReceptionSchedule;

        if ($schedule === null || $schedule->status !== PlantReceptionSchedule::STATUS_CONFIRMED) {
            throw ValidationException::withMessages([
                'unload_request_id' => ['La cita de recepción en planta de esta solicitud todavía no está Confirmada.'],
            ]);
        }
    }

    /**
     * D-PRG-05: `manifest_load_id` se propaga automáticamente si existe uno
     * ACTIVO -- vía `unload_request.manifest_load_id` directo, o
     * (si es NULL) buscando el `manifest_load` ACTIVO de
     * `unload_request.transport_schedule_id`. NULL si ninguna ruta resuelve
     * (autotransporte sin cargue formal).
     */
    private function resolveManifestLoadId(UnloadRequest $unloadRequest): ?int
    {
        if ($unloadRequest->manifest_load_id !== null) {
            return $unloadRequest->manifest_load_id;
        }

        if ($unloadRequest->transport_schedule_id === null) {
            return null;
        }

        return ManifestLoad::query()
            ->where('transport_schedule_id', $unloadRequest->transport_schedule_id)
            ->where('is_active', true)
            ->value('id');
    }

    /**
     * Anti-IDOR: `receiver_person_id` debe pertenecer a la organización
     * RECEPTORA -- mismo criterio que
     * `ManifestLoadController::assertPersonBelongsToOrganization()`.
     */
    private function assertPersonBelongsToOrganization(int $personId, ?int $organizationId): void
    {
        $person = Person::withTrashed()->find($personId);

        if ($person && (int) $person->organization_id !== (int) $organizationId) {
            throw ValidationException::withMessages([
                'receiver_person_id' => ['La persona indicada no pertenece a la organización Receptora.'],
            ]);
        }
    }

    private function manifestAlreadyActiveForRequest(int $unloadRequestId): bool
    {
        return ManifestUnload::query()
            ->where('unload_request_id', $unloadRequestId)
            ->where('is_active', true)
            ->exists();
    }

    private function defaultManifestStatusId(string $code): int
    {
        $id = ManifestStatus::query()->where('code', $code)->value('id');

        if ($id === null) {
            throw new \LogicException("Catálogo manifest_statuses sin el valor '{$code}' sembrado.");
        }

        return $id;
    }

    private function generateManifestNumber(int $receivingOrganizationId): string
    {
        do {
            $code = sprintf('MUN-%d-%s', $receivingOrganizationId, Str::upper(Str::random(8)));
        } while (ManifestUnload::withTrashed()->where('tenant_organization_id', $receivingOrganizationId)->where('manifest_number', $code)->exists());

        return $code;
    }
}
