<?php

namespace App\Services;

use App\Models\ManifestStatus;
use App\Models\ManifestUnload;
use App\Models\User;
use App\Models\Workflow;
use App\Models\WorkflowLog;
use App\Models\WorkflowTransition;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Módulo Manifiesto de Descargue, Fase 5 -- mecánica de transición de
 * `manifest_unloads.manifest_status_id` vía el motor de Workflow genérico
 * (`entity_type=MANIFEST`, `ManifestUnloadWorkflowSeeder`). Mismo patrón
 * EXACTO que `ManifestLoadWorkflowService` (Fase 3), con una diferencia
 * clave: resuelve `Workflow::resolveFor('MANIFEST',
 * $manifestUnload->receiving_organization_id, 'manifest_unloads')` -- el 3er
 * argumento desambigua frente al workflow "MANIFEST_LOAD" (mismo
 * `entity_type`, tabla distinta, ver docblock de `Workflow::resolveFor()`).
 *
 * Reutilizado TANTO por `ManifestUnloadController::generate()`/`complete()`/
 * `cancel()` (transiciones humanas, autorizadas por rol LOGÍSTICA del lado
 * RECEPTOR) COMO por `ManifestUnloadSignatureService::sign()` (transiciones
 * AUTOMÁTICAS Generated->PartiallySigned->Signed, disparadas por la firma).
 *
 * `tenant_organization_id` del `WorkflowLog` = `receiving_organization_id`
 * (organización DUEÑA del manifiesto de descargue, la que recibe/inspecciona)
 * -- mismo criterio que el resto de servicios de transición: nunca el tenant
 * del actor.
 */
class ManifestUnloadWorkflowService
{
    public static function transition(ManifestUnload $manifestUnload, User $actor, string $toCode): ManifestUnload
    {
        $manifestUnload->loadMissing('manifestStatus');
        $fromCode = $manifestUnload->manifestStatus?->code;

        if ($fromCode === $toCode) {
            return $manifestUnload;
        }

        $workflow = Workflow::resolveFor('MANIFEST', $manifestUnload->receiving_organization_id, 'manifest_unloads');

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

        return DB::transaction(function () use ($manifestUnload, $actor, $fromCode, $toCode, $statusId) {
            $attributes = ['manifest_status_id' => $statusId];

            // Mismo criterio EXACTO que `ManifestLoadWorkflowService`: apaga
            // `is_active` SOLO al llegar a `CANCELLED` (libera el
            // `unload_request_id` para un manifiesto de reemplazo, ver
            // índice único parcial `manifest_unloads_active_unique`).
            // Deliberadamente NO se hace lo mismo al llegar a `CLOSED` -- es
            // el cierre exitoso del ciclo, no debe liberar la unicidad para
            // un segundo manifiesto sobre la misma solicitud de descargue.
            if ($toCode === 'CANCELLED') {
                $attributes['is_active'] = false;
            }

            $manifestUnload->forceFill($attributes)->save();

            self::logWorkflowTransition($manifestUnload, $actor, $fromCode, $toCode);

            return $manifestUnload->fresh();
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

    private static function logWorkflowTransition(ManifestUnload $manifestUnload, User $actor, ?string $fromCode, string $toCode): void
    {
        WorkflowLog::query()->create([
            'traceability_uuid' => (string) Str::uuid(),
            'tenant_organization_id' => $manifestUnload->receiving_organization_id,
            'user_id' => $actor->id,
            'process_type' => 'MANIFEST_UNLOAD',
            'process_id' => $manifestUnload->id,
            'event_code' => "MANIFEST_UNLOAD_{$toCode}",
            'event_name' => "Manifiesto de descargue transicionado a {$toCode}",
            'description' => "Transición {$fromCode} -> {$toCode} del manifiesto de descargue '{$manifestUnload->manifest_number}'.",
            'previous_status' => $fromCode,
            'new_status' => $toCode,
            'severity' => 'INFO',
            'source' => 'api',
        ]);
    }

    /**
     * Mismo criterio exacto que
     * `ManifestLoadWorkflowService::assertActorAuthorizedForTransition()`.
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
