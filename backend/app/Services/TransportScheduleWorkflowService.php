<?php

namespace App\Services;

use App\Models\TransportSchedule;
use App\Models\TransportStatus;
use App\Models\User;
use App\Models\Workflow;
use App\Models\WorkflowLog;
use App\Models\WorkflowTransition;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Módulo Programación Logística, Fase 2a (D-PRG-01 a D-PRG-14) -- mecánica
 * de transición de `transport_schedules.transport_status_id` vía el motor de
 * Workflow genérico (`entity_type=SCHEDULING`, `TransportScheduleWorkflowSeeder`).
 * Mismo patrón EXACTO que `ServiceRequestApprovalService::transitionHeader()`:
 * resuelve `Workflow::resolveFor('SCHEDULING', $schedule->organization_id)`,
 * valida que exista una `workflow_transition` real desde el código actual
 * hacia el destino, autoriza al actor contra `workflow_transition_roles`, y
 * deja rastro en `workflow_logs` (`process_type=TRANSPORT_SCHEDULE`).
 *
 * A diferencia de Solicitudes de Servicio, aquí NO hay agregado
 * cabecera<->ítems (D-S01/D-S27) -- `transport_schedules` no depende del
 * estado de sus `transport_schedule_items` para transicionar, así que esta
 * clase solo necesita el método de transición de UNA fila, sin
 * `recalculateHeaderStatus()` equivalente.
 */
class TransportScheduleWorkflowService
{
    /**
     * Público y reutilizado por `TransportScheduleController::submit()`/
     * `confirm()`/`cancel()` -- evita duplicar la resolución del motor de
     * Workflow en el controller.
     */
    public static function transition(TransportSchedule $schedule, User $actor, string $toCode): TransportSchedule
    {
        $schedule->loadMissing('transportStatus');
        $fromCode = $schedule->transportStatus?->code;

        if ($fromCode === $toCode) {
            return $schedule;
        }

        $workflow = Workflow::resolveFor('SCHEDULING', $schedule->organization_id);

        $transition = $workflow?->currentVersion
            ?->transitions()
            ->where('from_status_code', $fromCode)
            ->where('to_status_code', $toCode)
            ->with(['roles.role', 'roles.businessRole'])
            ->first();

        if ($transition === null) {
            throw ValidationException::withMessages([
                'transport_status' => ["No existe una transición configurada de {$fromCode} a {$toCode} para esta programación."],
            ]);
        }

        self::assertActorAuthorizedForTransition($actor, $transition);

        $status = TransportStatus::query()->where('code', $toCode)->first();

        if ($status === null) {
            throw new \LogicException("Catálogo transport_statuses sin el valor '{$toCode}' sembrado.");
        }

        return DB::transaction(function () use ($schedule, $actor, $fromCode, $toCode, $status) {
            $schedule->forceFill(['transport_status_id' => $status->id, 'updated_by' => $actor->id])->save();

            // Hallazgo Medio (revisión de seguridad Programación/Dispatch,
            // 2026-07-19): apaga `transport_schedule_items.is_active` al
            // llegar a un estado FINAL (CANC/FIN) -- libera el ítem para que
            // pueda re-programarse (ya cubierto por
            // `itemAlreadyScheduled()`) y mantiene el índice único parcial
            // `transport_schedule_items_active_unique` en sincronía con esa
            // misma regla de negocio, en vez de solo vivir en la capa de
            // aplicación.
            if ($status->is_final) {
                $schedule->items()->update(['is_active' => false]);
            }

            self::logWorkflowTransition($schedule, $actor, $fromCode, $toCode);

            return $schedule->fresh();
        });
    }

    /**
     * Mismo criterio que `ServiceRequestApprovalService::logWorkflowTransition()`:
     * `tenant_organization_id` = organización DUEÑA de la programación
     * (`$schedule->organization_id`), nunca el tenant del actor -- evita que,
     * cuando actúa platform staff, el log quede atribuido al tenant
     * PLATAFORMA en vez de a la organización real dueña del proceso.
     */
    private static function logWorkflowTransition(TransportSchedule $schedule, User $actor, ?string $fromCode, string $toCode): void
    {
        WorkflowLog::query()->create([
            'traceability_uuid' => (string) Str::uuid(),
            'tenant_organization_id' => $schedule->organization_id,
            'user_id' => $actor->id,
            'process_type' => 'TRANSPORT_SCHEDULE',
            'process_id' => $schedule->id,
            'event_code' => "TRANSPORT_SCHEDULE_{$toCode}",
            'event_name' => "Programación de transporte transicionada a {$toCode}",
            'description' => "Transición {$fromCode} -> {$toCode} de la programación '{$schedule->schedule_number}'.",
            'previous_status' => $fromCode,
            'new_status' => $toCode,
            'severity' => 'INFO',
            'source' => 'api',
        ]);
    }

    /**
     * Mismo criterio exacto que
     * `ServiceRequestApprovalService::assertActorAuthorizedForTransition()`.
     */
    private static function assertActorAuthorizedForTransition(User $actor, WorkflowTransition $transition): void
    {
        if ($actor->isPlatformStaff()) {
            return;
        }

        $transitionRoles = $transition->roles;

        if ($transitionRoles->isEmpty()) {
            return;
        }

        foreach ($transitionRoles as $transitionRole) {
            if ($transitionRole->role_id !== null && $transitionRole->role !== null && $actor->hasRole($transitionRole->role->code)) {
                return;
            }

            if ($transitionRole->business_role_id !== null
                && $actor->tenantOrganization?->businessRoles()
                    ->where('business_roles.id', $transitionRole->business_role_id)
                    ->wherePivot('is_active', true)
                    ->exists()) {
                return;
            }
        }

        abort(403, 'El actor no tiene el rol requerido por el workflow configurado para esta transición.');
    }
}
