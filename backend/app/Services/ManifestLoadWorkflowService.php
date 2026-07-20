<?php

namespace App\Services;

use App\Models\ManifestLoad;
use App\Models\ManifestStatus;
use App\Models\User;
use App\Models\Workflow;
use App\Models\WorkflowLog;
use App\Models\WorkflowTransition;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Módulo Manifiesto de Cargue, Fase 3 -- mecánica de transición de
 * `manifest_loads.manifest_status_id` vía el motor de Workflow genérico
 * (`entity_type=MANIFEST`, `ManifestLoadWorkflowSeeder`). Mismo patrón EXACTO
 * que `TransportScheduleWorkflowService`/`ServiceRequestApprovalService::transitionHeader()`:
 * resuelve `Workflow::resolveFor('MANIFEST', $manifestLoad->carrier_organization_id, 'manifest_loads')`
 * (Fase 5: el 3er argumento desambigua frente al workflow "MANIFEST_UNLOAD"
 * de `manifest_unloads`, que comparte el mismo `entity_type=MANIFEST` -- ver
 * docblock de `Workflow::resolveFor()`), valida que exista una `workflow_transition` real desde el código actual
 * hacia el destino, autoriza al actor contra `workflow_transition_roles`, y
 * deja rastro en `workflow_logs` (`process_type=MANIFEST_LOAD`).
 *
 * Reutilizado TANTO por `ManifestLoadController::generate()`/`startTransit()`/
 * `cancel()` (transiciones humanas, autorizadas por rol LOGÍSTICA) COMO por
 * `ManifestLoadSignatureService::sign()` (transiciones AUTOMÁTICAS
 * Generated->PartiallySigned->Signed, disparadas por la firma en vez de por
 * elección manual del actor -- sembradas SIN `workflow_transition_roles`,
 * mismo criterio que la transición automática SUBMITTED->UNDER_REVIEW de
 * `ServiceRequestWorkflowSeeder`).
 *
 * `tenant_organization_id` del `WorkflowLog` = `carrier_organization_id`
 * (organización DUEÑA del manifiesto, la que programó el transporte) --
 * mismo criterio que el resto de servicios de transición de este proyecto:
 * nunca el tenant del actor, para que el log no quede atribuido a la
 * organización PLATAFORMA cuando actúa platform staff.
 */
class ManifestLoadWorkflowService
{
    public static function transition(ManifestLoad $manifestLoad, User $actor, string $toCode): ManifestLoad
    {
        $manifestLoad->loadMissing('manifestStatus');
        $fromCode = $manifestLoad->manifestStatus?->code;

        if ($fromCode === $toCode) {
            return $manifestLoad;
        }

        $workflow = Workflow::resolveFor('MANIFEST', $manifestLoad->carrier_organization_id, 'manifest_loads');

        $transition = $workflow?->currentVersion
            ?->transitions()
            ->where('from_status_code', $fromCode)
            ->where('to_status_code', $toCode)
            ->with(['roles.role', 'roles.businessRole'])
            ->first();

        if ($transition === null) {
            throw ValidationException::withMessages([
                'manifest_status' => ["No existe una transición configurada de {$fromCode} a {$toCode} para este manifiesto."],
            ]);
        }

        self::assertActorAuthorizedForTransition($actor, $transition);

        $statusId = self::resolveManifestStatusId($toCode);

        return DB::transaction(function () use ($manifestLoad, $actor, $fromCode, $toCode, $statusId) {
            $attributes = ['manifest_status_id' => $statusId];

            // Hallazgo Medio (revisión de seguridad Manifiesto de Cargue,
            // 2026-07-19): apaga `manifest_loads.is_active` SOLO al llegar a
            // `CANCELLED` -- libera el `transport_schedule_id` para que pueda
            // emitirse un manifiesto de reemplazo (ver docblock de la
            // migración `add_active_unique_index_to_manifest_loads_table`) y
            // mantiene el índice único parcial `manifest_loads_active_unique`
            // en sincronía con esta misma regla de negocio, en vez de solo
            // vivir en la capa de aplicación. Deliberadamente NO se hace lo
            // mismo para cualquier otro estado final (`Closed`, diferido a
            // `manifest_unloads`) -- ver docblock de la migración para el
            // razonamiento completo.
            if ($toCode === 'CANCELLED') {
                $attributes['is_active'] = false;
            }

            $manifestLoad->forceFill($attributes)->save();

            self::logWorkflowTransition($manifestLoad, $actor, $fromCode, $toCode);

            return $manifestLoad->fresh();
        });
    }

    private static function resolveManifestStatusId(string $code): int
    {
        $id = ManifestStatus::query()->where('code', $code)->value('id');

        if ($id === null) {
            throw new \LogicException("Catálogo manifest_statuses sin el valor '{$code}' sembrado.");
        }

        return $id;
    }

    private static function logWorkflowTransition(ManifestLoad $manifestLoad, User $actor, ?string $fromCode, string $toCode): void
    {
        WorkflowLog::query()->create([
            'traceability_uuid' => (string) Str::uuid(),
            'tenant_organization_id' => $manifestLoad->carrier_organization_id,
            'user_id' => $actor->id,
            'process_type' => 'MANIFEST_LOAD',
            'process_id' => $manifestLoad->id,
            'event_code' => "MANIFEST_LOAD_{$toCode}",
            'event_name' => "Manifiesto de cargue transicionado a {$toCode}",
            'description' => "Transición {$fromCode} -> {$toCode} del manifiesto de cargue '{$manifestLoad->manifest_number}'.",
            'previous_status' => $fromCode,
            'new_status' => $toCode,
            'severity' => 'INFO',
            'source' => 'api',
        ]);
    }

    /**
     * Mismo criterio exacto que
     * `TransportScheduleWorkflowService::assertActorAuthorizedForTransition()`.
     * Las transiciones automáticas disparadas por la firma
     * (Generated->PartiallySigned->Signed) se siembran SIN
     * `workflow_transition_roles` -- cualquier actor que haya llegado hasta
     * `ManifestLoadSignatureService::sign()` (que YA validó por su cuenta
     * quién puede firmar como generador/conductor) pasa sin restricción
     * adicional aquí.
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
