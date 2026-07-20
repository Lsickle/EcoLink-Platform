<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Concerns\LogsSecurityEvents;
use App\Http\Controllers\Controller;
use App\Models\BranchLocation;
use App\Models\PlantReceptionSchedule;
use App\Models\UnloadRequest;
use App\Policies\PlantReceptionSchedulePolicy;
use App\Services\PlantReceptionScheduleService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Fase 4 "Cita de Recepción en Planta (bilateral)" -- `plant_reception_schedules`,
 * expuesta sobre una `unload_requests` ya Aprobada (RN-RCP-015). Toda la
 * mecánica de propuesta/contrapropuesta/confirmación/reprogramación vive en
 * `PlantReceptionScheduleService` -- este controller solo autoriza (Policy)
 * y traduce HTTP.
 */
class PlantReceptionScheduleController extends Controller
{
    use LogsSecurityEvents;

    /**
     * Índice GENERAL (no anidado bajo una `unload_request`) -- agenda de
     * citas de recepción por sede, para `PlantReceptionAgendaScreen` en el
     * frontend. `receiving_branch_id` es OBLIGATORIO: sin él, la consulta
     * recorrería la tabla completa (todas las sedes de todas las
     * organizaciones), un volumen que no tiene sentido de negocio -- la
     * agenda siempre se consulta desde el contexto de UNA planta.
     *
     * Aislamiento anti-IDOR: mismo criterio DUAL que
     * `UnloadRequestController::index()` -- el actor ve las franjas de la
     * sede consultada si (a) pertenece a la organización dueña de esa sede
     * (lado receptor, ve TODAS las franjas de su planta), o (b) es el lado
     * transportador de la `unload_request` dueña de cada franja (solo ve
     * las suyas), o (c) es platform staff (sin restricción). Ninguna de las
     * 2 condiciones -> lista vacía, no 403 -- mismo criterio que el índice
     * general de `UnloadRequestController` (permiso grueso vía
     * `viewAny()`, filtrado fino por fila vía scope de query).
     */
    public function index(Request $request)
    {
        $actor = $request->user();
        abort_unless((new PlantReceptionSchedulePolicy)->viewAny($actor), 403, 'No tiene permiso para consultar la agenda de citas de recepción.');

        $data = $request->validate([
            'receiving_branch_id' => ['required', 'integer', 'exists:branches,id'],
            'date_from' => ['sometimes', 'nullable', 'date'],
            'date_to' => ['sometimes', 'nullable', 'date', 'after_or_equal:date_from'],
            'status' => ['sometimes', 'nullable', 'string', 'in:'.implode(',', [
                PlantReceptionSchedule::STATUS_PROPOSED,
                PlantReceptionSchedule::STATUS_COUNTER_PROPOSED,
                PlantReceptionSchedule::STATUS_CONFIRMED,
                PlantReceptionSchedule::STATUS_SUPERSEDED,
            ])],
        ]);

        $schedules = PlantReceptionSchedule::query()
            ->where('receiving_branch_id', $data['receiving_branch_id'])
            ->when(! $actor->isPlatformStaff(), function ($query) use ($actor) {
                // Hallazgo ALTO (especialista-seguridad, 2026-07-20), mismo criterio
                // que `UnloadRequestController::index()`: un actor con
                // `tenant_organization_id=NULL` (estado legítimo, ver
                // `ServiceRequestPolicy::view()`) produce `where('organization_id'/
                // 'carrier_organization_id', null)`, que Eloquent traduce a `IS
                // NULL`. Como `unload_requests.carrier_organization_id` es NULLABLE
                // (D-PRG-02), ese actor vería franjas de CUALQUIER organización con
                // ese campo en NULL -- fuga cross-tenant real. Se fuerza lista
                // vacía en vez de comparar contra NULL.
                if ($actor->tenant_organization_id === null) {
                    $query->whereRaw('1 = 0');

                    return;
                }

                $query->where(function ($query) use ($actor) {
                    $query->whereHas('receivingBranch', fn ($query) => $query->where('organization_id', $actor->tenant_organization_id))
                        ->orWhereHas('unloadRequest', fn ($query) => $query->where('carrier_organization_id', $actor->tenant_organization_id));
                });
            })
            ->when($data['date_from'] ?? null, fn ($query, $dateFrom) => $query->whereDate('scheduled_date', '>=', $dateFrom))
            ->when($data['date_to'] ?? null, fn ($query, $dateTo) => $query->whereDate('scheduled_date', '<=', $dateTo))
            ->when($data['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->with([
                'dockLocation', 'proposedByUser:id,username', 'counterProposedByUser:id,username', 'confirmedByUser:id,username',
                'unloadRequest:id,request_number,receiving_branch_id,carrier_organization_id',
            ])
            ->orderBy('scheduled_date')
            ->orderBy('scheduled_start_at')
            ->paginate($request->integer('per_page', 15));

        return response()->json($schedules);
    }

    /**
     * Muestra la franja VIGENTE (activa) de una solicitud, si existe.
     */
    public function show(Request $request, UnloadRequest $unloadRequest)
    {
        $actor = $request->user();
        abort_unless($unloadRequest->isAccessibleBy($actor) && $actor->hasPermission('plant_reception_schedules.read'), 403, 'No tiene acceso a la cita de recepción de esta solicitud.');

        $schedule = $unloadRequest->activeReceptionSchedule()->with(['dockLocation', 'proposedByUser:id,username', 'counterProposedByUser:id,username'])->first();

        return response()->json(['plant_reception_schedule' => $schedule]);
    }

    /**
     * Crea la PRIMERA propuesta de franja (solo si la solicitud está
     * Aprobada y no existe ya una franja vigente).
     */
    public function propose(Request $request, UnloadRequest $unloadRequest)
    {
        $actor = $request->user();
        abort_unless((new PlantReceptionSchedulePolicy)->proposeOn($actor, $unloadRequest), 403, 'No tiene acceso a esta solicitud de descargue.');

        $data = $request->validate($this->slotValidationRules());

        if (! empty($data['dock_location_id'])) {
            $this->assertDockBelongsToReceivingBranch((int) $data['dock_location_id'], $unloadRequest->receiving_branch_id);
        }

        $schedule = PlantReceptionScheduleService::propose($unloadRequest, $actor, $data);

        $this->logSecurityEvent(
            $request, 'PLANT_RECEPTION_SCHEDULE_PROPOSED', 'SUCCESS',
            "Franja de recepción propuesta para la solicitud '{$unloadRequest->request_number}'.", $actor,
            ['plant_reception_schedule_id' => $schedule->id, 'unload_request_id' => $unloadRequest->id],
        );

        return response()->json(['plant_reception_schedule' => $schedule->fresh(['dockLocation'])], 201);
    }

    public function counterPropose(Request $request, PlantReceptionSchedule $schedule)
    {
        $actor = $request->user();
        abort_unless((new PlantReceptionSchedulePolicy)->manage($actor, $schedule), 403, 'No tiene acceso a esta cita de recepción.');

        $data = $request->validate([
            'counter_proposed_date' => ['required', 'date'],
            'counter_proposed_start_at' => ['required', 'date'],
            'counter_proposed_end_at' => ['required', 'date', 'after:counter_proposed_start_at'],
        ]);

        $schedule = PlantReceptionScheduleService::counterPropose($schedule, $actor, $data);

        $this->logSecurityEvent(
            $request, 'PLANT_RECEPTION_SCHEDULE_COUNTER_PROPOSED', 'SUCCESS',
            "Franja de recepción contrapropuesta (#{$schedule->id}).", $actor,
            ['plant_reception_schedule_id' => $schedule->id],
        );

        return response()->json(['plant_reception_schedule' => $schedule]);
    }

    public function confirm(Request $request, PlantReceptionSchedule $schedule)
    {
        $actor = $request->user();
        abort_unless((new PlantReceptionSchedulePolicy)->manage($actor, $schedule), 403, 'No tiene acceso a esta cita de recepción.');

        $schedule = PlantReceptionScheduleService::confirm($schedule, $actor);

        $this->logSecurityEvent(
            $request, 'PLANT_RECEPTION_SCHEDULE_CONFIRMED', 'SUCCESS',
            "Franja de recepción confirmada (#{$schedule->id}).", $actor,
            ['plant_reception_schedule_id' => $schedule->id],
        );

        return response()->json(['plant_reception_schedule' => $schedule]);
    }

    public function reschedule(Request $request, PlantReceptionSchedule $schedule)
    {
        $actor = $request->user();
        abort_unless((new PlantReceptionSchedulePolicy)->manage($actor, $schedule), 403, 'No tiene acceso a esta cita de recepción.');

        $data = $request->validate([
            ...$this->slotValidationRules(),
            'reschedule_reason' => ['required', 'string', 'max:1000'],
        ]);

        if (! empty($data['dock_location_id'])) {
            $this->assertDockBelongsToReceivingBranch((int) $data['dock_location_id'], $schedule->receiving_branch_id);
        }

        $newSchedule = PlantReceptionScheduleService::reschedule($schedule, $actor, $data);

        $this->logSecurityEvent(
            $request, 'PLANT_RECEPTION_SCHEDULE_RESCHEDULED', 'SUCCESS',
            "Franja de recepción reprogramada (nueva versión #{$newSchedule->id}, anterior #{$schedule->id}).", $actor,
            ['plant_reception_schedule_id' => $newSchedule->id, 'parent_schedule_id' => $schedule->id],
        );

        return response()->json(['plant_reception_schedule' => $newSchedule], 201);
    }

    private function slotValidationRules(): array
    {
        return [
            'dock_location_id' => ['sometimes', 'nullable', 'integer', 'exists:branch_locations,id'],
            'scheduled_date' => ['required', 'date'],
            'scheduled_start_at' => ['required', 'date'],
            'scheduled_end_at' => ['required', 'date', 'after:scheduled_start_at'],
        ];
    }

    /**
     * Anti-IDOR: el muelle indicado debe pertenecer a la MISMA sede
     * receptora de la solicitud -- mismo criterio de pertenencia ya usado en
     * el resto del proyecto (`withTrashed()`, un muelle soft-eliminado de
     * OTRA sede no debe pasar silenciosamente el chequeo).
     */
    private function assertDockBelongsToReceivingBranch(int $dockLocationId, int $receivingBranchId): void
    {
        $dock = BranchLocation::withTrashed()->find($dockLocationId);

        if ($dock && (int) $dock->branch_id !== $receivingBranchId) {
            throw ValidationException::withMessages([
                'dock_location_id' => ['El muelle indicado no pertenece a la sede receptora de esta solicitud.'],
            ]);
        }
    }
}
