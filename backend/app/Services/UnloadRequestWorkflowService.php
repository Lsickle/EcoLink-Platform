<?php

namespace App\Services;

use App\Models\UnloadRequest;
use App\Models\UnloadRequestStatus;
use App\Models\User;
use App\Models\Workflow;
use App\Models\WorkflowLog;
use App\Models\WorkflowTransition;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Fase 4 "Cita de Recepción en Planta" -- mecánica de transición de
 * `unload_requests.unload_request_status_id` vía el motor de Workflow
 * genérico (`entity_type=TRANSPORT`, `UnloadRequestWorkflowSeeder` -- ver su
 * docblock para el razonamiento completo de por qué `TRANSPORT` y no
 * `SCHEDULING`). Mismo patrón EXACTO que
 * `TransportScheduleWorkflowService`/`ManifestLoadWorkflowService`: resuelve
 * `Workflow::resolveFor('TRANSPORT', $unloadRequest->carrier_organization_id)`,
 * valida que exista una `workflow_transition` real desde el código actual
 * hacia el destino, autoriza al actor contra `workflow_transition_roles`, y
 * deja rastro en `workflow_logs` (`process_type=UNLOAD_REQUEST`).
 *
 * `carrier_organization_id` como ancla de resolución de personalización de
 * organización (mismo criterio que `ManifestLoadWorkflowService`, que usa
 * `carrier_organization_id` en vez de la organización receptora) -- puede
 * ser NULL (caso "anticipada" sin transportador asignado todavía), en cuyo
 * caso `Workflow::resolveFor()` cae directo al workflow BASE del sistema.
 */
class UnloadRequestWorkflowService
{
    public static function transition(UnloadRequest $unloadRequest, User $actor, string $toCode): UnloadRequest
    {
        $unloadRequest->loadMissing('unloadRequestStatus');
        $fromCode = $unloadRequest->unloadRequestStatus?->code;

        if ($fromCode === $toCode) {
            return $unloadRequest;
        }

        $workflow = Workflow::resolveFor('TRANSPORT', $unloadRequest->carrier_organization_id);

        $transition = $workflow?->currentVersion
            ?->transitions()
            ->where('from_status_code', $fromCode)
            ->where('to_status_code', $toCode)
            ->with(['roles.role', 'roles.businessRole'])
            ->first();

        if ($transition === null) {
            throw ValidationException::withMessages([
                'unload_request_status' => ["No existe una transición configurada de {$fromCode} a {$toCode} para esta solicitud."],
            ]);
        }

        self::assertActorAuthorizedForTransition($actor, $transition);

        $statusId = self::resolveStatusId($toCode);

        return DB::transaction(function () use ($unloadRequest, $actor, $fromCode, $toCode, $statusId) {
            $attributes = ['unload_request_status_id' => $statusId, 'updated_by' => $actor->id];

            if ($toCode === 'SUBMITTED') {
                $attributes['submitted_at'] = now();
            }

            if (in_array($toCode, ['APPROVED', 'REJECTED'], true)) {
                $attributes['decided_by'] = $actor->id;
                $attributes['decided_at'] = now();
            }

            $unloadRequest->forceFill($attributes)->save();

            self::logWorkflowTransition($unloadRequest, $actor, $fromCode, $toCode);

            return $unloadRequest->fresh();
        });
    }

    private static function resolveStatusId(string $code): int
    {
        $id = UnloadRequestStatus::query()->where('code', $code)->value('id');

        if ($id === null) {
            throw new \LogicException("Catálogo unload_request_statuses sin el valor '{$code}' sembrado.");
        }

        return $id;
    }

    /**
     * `tenant_organization_id` = `unload_requests.tenant_organization_id`
     * (organización DUEÑA de la fila, la CARRIER/creadora) -- mismo criterio
     * que el resto de servicios de transición de este proyecto: nunca el
     * tenant del actor, para que el log no quede atribuido a la organización
     * PLATAFORMA cuando actúa platform staff.
     */
    private static function logWorkflowTransition(UnloadRequest $unloadRequest, User $actor, ?string $fromCode, string $toCode): void
    {
        WorkflowLog::query()->create([
            'traceability_uuid' => (string) Str::uuid(),
            'tenant_organization_id' => $unloadRequest->tenant_organization_id,
            'user_id' => $actor->id,
            'process_type' => 'UNLOAD_REQUEST',
            'process_id' => $unloadRequest->id,
            'event_code' => "UNLOAD_REQUEST_{$toCode}",
            'event_name' => "Solicitud de descargue transicionada a {$toCode}",
            'description' => "Transición {$fromCode} -> {$toCode} de la solicitud de descargue '{$unloadRequest->request_number}'.",
            'previous_status' => $fromCode,
            'new_status' => $toCode,
            'severity' => 'INFO',
            'source' => 'api',
        ]);
    }

    /**
     * Mismo criterio exacto que
     * `TransportScheduleWorkflowService::assertActorAuthorizedForTransition()`.
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
