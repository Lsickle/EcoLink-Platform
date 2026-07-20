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
     * Muestra la franja VIGENTE (activa) de una solicitud, si existe.
     */
    public function show(Request $request, UnloadRequest $unloadRequest)
    {
        $actor = $request->user();
        abort_unless($unloadRequest->isAccessibleBy($actor) && $actor->hasPermission('plant_reception_schedules.read'), 403, 'No tiene acceso a la cita de recepción de esta solicitud.');

        $schedule = $unloadRequest->activeReceptionSchedule()->with(['dockLocation', 'proposedByUser:id,username'])->first();

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
