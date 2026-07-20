<?php

namespace App\Services;

use App\Models\PlantReceptionSchedule;
use App\Models\UnloadRequest;
use App\Models\User;
use App\Models\WorkflowLog;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Fase 4 "Cita de Recepción en Planta (bilateral)" -- capa de servicio
 * propia (D-PRG-02, decisión #2 del enunciado de esta tarea) para la lógica
 * de propuesta/contrapropuesta/confirmación de `plant_reception_schedules`,
 * NO el motor de Workflow genérico (`status` es VARCHAR libre, ver docblock
 * del modelo/migración) -- mismo criterio que `ServiceRequestApprovalService`
 * frente al agregado cabecera<->ítems (D-S27).
 *
 * Un `WorkflowLog` de auditoría en CADA transición relevante (propose/
 * counterPropose/confirm/reschedule), con `process_type=PLANT_RECEPTION_SCHEDULE`
 * -- mismo patrón sin excepción ya aplicado en Fases 1-3 (gap detectado y
 * corregido 3 veces, instrucción explícita de esta tarea de NO repetirlo).
 *
 * Métodos ESTÁTICOS -- mismo criterio ya establecido en este proyecto para
 * clases de `App\Services` sin estado de instancia.
 */
class PlantReceptionScheduleService
{
    /**
     * Crea la PRIMERA propuesta de franja para una `unload_requests` YA
     * Aprobada (RN-RCP-015) -- solo puede haber, como máximo, UNA fila
     * `is_active=true` por `unload_request_id` (índice único parcial
     * `plant_reception_schedules_active_unique`).
     */
    public static function propose(UnloadRequest $unloadRequest, User $actor, array $data): PlantReceptionSchedule
    {
        self::assertUnloadRequestApproved($unloadRequest);

        if ($unloadRequest->activeReceptionSchedule()->exists()) {
            throw ValidationException::withMessages([
                'unload_request_id' => ['Ya existe una franja vigente para esta solicitud. Use contraproponer/confirmar en vez de proponer de nuevo.'],
            ]);
        }

        $role = self::resolveActorRole($unloadRequest, $actor);

        return DB::transaction(function () use ($unloadRequest, $actor, $data, $role) {
            // `status`/`version_number`/`parent_schedule_id` se retiran
            // deliberadamente del $fillable del modelo -- `create()` (mass
            // assignment) los descartaría en SILENCIO, dejando el atributo en
            // memoria en NULL aunque la columna tenga DEFAULT en la BD (mismo
            // riesgo documentado en `HasUuid`). Se construye con `fill()` +
            // `forceFill()` en vez de `::create()`.
            $schedule = new PlantReceptionSchedule;
            $schedule->fill([
                'tenant_organization_id' => $unloadRequest->tenant_organization_id,
                'unload_request_id' => $unloadRequest->id,
                'receiving_branch_id' => $unloadRequest->receiving_branch_id,
                'dock_location_id' => $data['dock_location_id'] ?? null,
                'scheduled_date' => $data['scheduled_date'],
                'scheduled_start_at' => $data['scheduled_start_at'],
                'scheduled_end_at' => $data['scheduled_end_at'],
                'proposed_by_role' => $role,
                'proposed_by_user_id' => $actor->id,
                'proposed_at' => now(),
                'is_active' => true,
            ]);
            $schedule->forceFill([
                'status' => PlantReceptionSchedule::STATUS_PROPOSED,
                'version_number' => 1,
                'parent_schedule_id' => null,
                'created_by' => $actor->id,
                'updated_by' => $actor->id,
            ]);
            $schedule->save();

            self::logTransition($schedule, $actor, 'PROPOSED', "Franja propuesta por primera vez para la solicitud '{$unloadRequest->request_number}'.");

            return $schedule;
        });
    }

    /**
     * La OTRA parte contrapropone una franja distinta -- alcanzable desde
     * `PROPOSED`/`COUNTER_PROPOSED` (permite re-contrapropuesta si la
     * negociación sigue abierta). FLAG explícito (ambigüedad de negocio NO
     * resuelta, ver resumen de esta tarea): no se impone alternancia
     * estricta de turno (que el mismo lado no pueda contra-proponerse a sí
     * mismo) -- cualquiera de los 2 lados accesibles puede invocarlo
     * mientras la franja no esté Confirmada/Superada.
     */
    public static function counterPropose(PlantReceptionSchedule $schedule, User $actor, array $data): PlantReceptionSchedule
    {
        self::assertCounterProposable($schedule);

        return DB::transaction(function () use ($schedule, $actor, $data) {
            $schedule->forceFill([
                'counter_proposed_date' => $data['counter_proposed_date'],
                'counter_proposed_start_at' => $data['counter_proposed_start_at'],
                'counter_proposed_end_at' => $data['counter_proposed_end_at'],
                'counter_proposed_by' => $actor->id,
                'counter_proposed_at' => now(),
                'status' => PlantReceptionSchedule::STATUS_COUNTER_PROPOSED,
                'updated_by' => $actor->id,
            ])->save();

            self::logTransition($schedule, $actor, 'COUNTER_PROPOSED', 'Franja contrapropuesta.');

            return $schedule->fresh();
        });
    }

    /**
     * Cualquiera de las 2 partes acepta la franja VIGENTE -- la propuesta
     * original (`status=PROPOSED`) o la contrapropuesta (`status=COUNTER_PROPOSED`,
     * en cuyo caso los valores `counter_proposed_*` se PROMUEVEN a
     * `scheduled_*`, que pasan a representar siempre la franja acordada
     * final).
     *
     * Hallazgo Alto (revisión de seguridad, 2026-07-19): antes de este fix,
     * el MISMO lado que hizo la última propuesta/contrapropuesta vigente
     * podía confirmarla él mismo -- una "confirmación" unilateral, pese a
     * que el `WorkflowLog` afirmaba literalmente "confirmada por ambas
     * partes" (un registro de auditoría falso). `assertActorIsOppositeSideOfLastProposal()`
     * exige que el actor pertenezca a la organización CONTRARIA a la de
     * quien hizo la última propuesta/contrapropuesta vigente.
     */
    public static function confirm(PlantReceptionSchedule $schedule, User $actor): PlantReceptionSchedule
    {
        if (! in_array($schedule->status, [PlantReceptionSchedule::STATUS_PROPOSED, PlantReceptionSchedule::STATUS_COUNTER_PROPOSED], true)) {
            throw ValidationException::withMessages([
                'status' => ['Solo se puede confirmar una franja Propuesta o Contrapropuesta.'],
            ]);
        }

        self::assertActorIsOppositeSideOfLastProposal($schedule, $actor);

        return DB::transaction(function () use ($schedule, $actor) {
            $attributes = [
                'confirmed_by' => $actor->id,
                'confirmed_at' => now(),
                'status' => PlantReceptionSchedule::STATUS_CONFIRMED,
                'updated_by' => $actor->id,
            ];

            if ($schedule->status === PlantReceptionSchedule::STATUS_COUNTER_PROPOSED) {
                $attributes['scheduled_date'] = $schedule->counter_proposed_date;
                $attributes['scheduled_start_at'] = $schedule->counter_proposed_start_at;
                $attributes['scheduled_end_at'] = $schedule->counter_proposed_end_at;
            }

            $schedule->forceFill($attributes)->save();

            self::logTransition($schedule, $actor, 'CONFIRMED', self::confirmationDescription($actor));

            return $schedule->fresh();
        });
    }

    /**
     * Reprograma una franja YA Confirmada -- apaga la fila anterior
     * (`SUPERSEDED`, `is_active=false`) y crea una fila NUEVA con
     * `parent_schedule_id` apuntando a la anterior, `version_number`
     * incrementado, en estado `PROPOSED` (arranca una negociación nueva).
     */
    public static function reschedule(PlantReceptionSchedule $schedule, User $actor, array $data): PlantReceptionSchedule
    {
        if ($schedule->status !== PlantReceptionSchedule::STATUS_CONFIRMED) {
            throw ValidationException::withMessages([
                'status' => ['Solo se puede reprogramar una franja ya Confirmada.'],
            ]);
        }

        $unloadRequest = $schedule->unloadRequest()->firstOrFail();
        $role = self::resolveActorRole($unloadRequest, $actor);

        return DB::transaction(function () use ($schedule, $actor, $data, $unloadRequest, $role) {
            $schedule->forceFill([
                'status' => PlantReceptionSchedule::STATUS_SUPERSEDED,
                'is_active' => false,
                'reschedule_reason' => $data['reschedule_reason'] ?? $schedule->reschedule_reason,
                'updated_by' => $actor->id,
            ])->save();

            // Mismo criterio que `propose()`: `fill()` + `forceFill()` en vez
            // de `::create()`, para que los atributos GUARDADOS
            // (`status`/`version_number`/`parent_schedule_id`) SÍ queden en
            // memoria (no solo en la BD vía DEFAULT).
            $newSchedule = new PlantReceptionSchedule;
            $newSchedule->fill([
                'tenant_organization_id' => $schedule->tenant_organization_id,
                'unload_request_id' => $unloadRequest->id,
                'receiving_branch_id' => $unloadRequest->receiving_branch_id,
                'dock_location_id' => $data['dock_location_id'] ?? $schedule->dock_location_id,
                'scheduled_date' => $data['scheduled_date'],
                'scheduled_start_at' => $data['scheduled_start_at'],
                'scheduled_end_at' => $data['scheduled_end_at'],
                'proposed_by_role' => $role,
                'proposed_by_user_id' => $actor->id,
                'proposed_at' => now(),
                'reschedule_reason' => $data['reschedule_reason'] ?? null,
                'is_active' => true,
            ]);
            $newSchedule->forceFill([
                'status' => PlantReceptionSchedule::STATUS_PROPOSED,
                'version_number' => $schedule->version_number + 1,
                'parent_schedule_id' => $schedule->id,
                'created_by' => $actor->id,
                'updated_by' => $actor->id,
            ]);
            $newSchedule->save();

            self::logTransition($newSchedule, $actor, 'RESCHEDULED', "Reprogramación de la franja #{$schedule->id} (versión {$newSchedule->version_number}).");

            return $newSchedule;
        });
    }

    private static function assertUnloadRequestApproved(UnloadRequest $unloadRequest): void
    {
        $unloadRequest->loadMissing('unloadRequestStatus');

        if ($unloadRequest->unloadRequestStatus?->code !== 'APPROVED') {
            throw ValidationException::withMessages([
                'unload_request_id' => ['Solo se puede proponer una franja de recepción sobre una solicitud Aprobada (RN-RCP-015).'],
            ]);
        }
    }

    private static function assertCounterProposable(PlantReceptionSchedule $schedule): void
    {
        if (! in_array($schedule->status, [PlantReceptionSchedule::STATUS_PROPOSED, PlantReceptionSchedule::STATUS_COUNTER_PROPOSED], true)) {
            throw ValidationException::withMessages([
                'status' => ['Solo se puede contraproponer una franja Propuesta o Contrapropuesta vigente.'],
            ]);
        }
    }

    /**
     * Deriva el rol de negocio de quien propone/contrapropone/reprograma,
     * a partir de a QUÉ ORGANIZACIÓN pertenece el actor (nunca aceptado del
     * payload del cliente, evita que un actor se auto-asigne un rol de
     * negocio que no le corresponde) -- valores del DDL
     * (`LOGISTICS_COORDINATOR`/`GENERATOR`/`RECEPTION_COORDINATOR`).
     */
    private static function resolveActorRole(UnloadRequest $unloadRequest, User $actor): string
    {
        if (! $actor->isPlatformStaff() && $unloadRequest->receivingOrganizationId() === $actor->tenant_organization_id) {
            return PlantReceptionSchedule::ROLE_RECEPTION_COORDINATOR;
        }

        if ($unloadRequest->service_modality === UnloadRequest::MODALITY_SELF_TRANSPORT) {
            return PlantReceptionSchedule::ROLE_GENERATOR;
        }

        return PlantReceptionSchedule::ROLE_LOGISTICS_COORDINATOR;
    }

    /**
     * Anti-auto-confirmación (hallazgo Alto, 2026-07-19): platform staff
     * SIEMPRE pasa -- mismo criterio ya usado en
     * `ManifestLoadSignatureService::assertActorCanSign()`/
     * `resolveActorRole()` de esta misma clase (un actor de plataforma no
     * tiene "lado organizacional" propio que pueda entrar en conflicto, actúa
     * como override universal). Para el resto, se resuelve la organización de
     * quien hizo la última propuesta/contrapropuesta VIGENTE
     * (`lastProposingOrganizationId()`) y se exige que el actor pertenezca a
     * la organización CONTRARIA -- si `$lastProposingOrganizationId` no se
     * pudo resolver (usuario proponente ya no existe/sin organización), se
     * omite el chequeo en vez de bloquear una confirmación legítima sin
     * evidencia real de auto-confirmación.
     */
    private static function assertActorIsOppositeSideOfLastProposal(PlantReceptionSchedule $schedule, User $actor): void
    {
        if ($actor->isPlatformStaff()) {
            return;
        }

        $lastProposingOrganizationId = self::lastProposingOrganizationId($schedule);

        if ($lastProposingOrganizationId !== null && $lastProposingOrganizationId === $actor->tenant_organization_id) {
            throw ValidationException::withMessages([
                'confirmed_by' => ['No puede confirmar esta franja: pertenece a la misma organización que realizó la última propuesta o contrapropuesta vigente. Debe confirmarla la otra parte.'],
            ]);
        }
    }

    /**
     * Organización de quien hizo la última propuesta VIGENTE -- si la franja
     * está `COUNTER_PROPOSED`, es la organización de `counter_proposed_by`;
     * en cualquier otro caso alcanzable aquí (`PROPOSED`), es la de
     * `proposed_by_user_id`. Se resuelve por la ORGANIZACIÓN del usuario
     * proponente, no por el usuario individual -- para no bloquear a otro
     * miembro del mismo lado organizacional que confirme en nombre de su
     * propia organización.
     */
    private static function lastProposingOrganizationId(PlantReceptionSchedule $schedule): ?int
    {
        $lastProposerUserId = $schedule->status === PlantReceptionSchedule::STATUS_COUNTER_PROPOSED
            ? $schedule->counter_proposed_by
            : $schedule->proposed_by_user_id;

        if ($lastProposerUserId === null) {
            return null;
        }

        return User::query()->find($lastProposerUserId)?->tenant_organization_id;
    }

    /**
     * Corrige el texto genérico "confirmada por ambas partes" (falso -- solo
     * participa UN actor en la llamada a `confirm()`) por una descripción que
     * refleja quién confirmó realmente.
     */
    private static function confirmationDescription(User $actor): string
    {
        if ($actor->isPlatformStaff()) {
            return 'Franja confirmada por un usuario de plataforma (EcoLink), en representación de una de las partes.';
        }

        $actor->loadMissing('tenantOrganization');
        $organizationLabel = $actor->tenantOrganization?->legal_name ?? "organización #{$actor->tenant_organization_id}";

        return "Franja confirmada por {$organizationLabel}.";
    }

    private static function logTransition(PlantReceptionSchedule $schedule, User $actor, string $eventCode, string $description): void
    {
        WorkflowLog::query()->create([
            'traceability_uuid' => (string) Str::uuid(),
            'tenant_organization_id' => $schedule->tenant_organization_id,
            'user_id' => $actor->id,
            'process_type' => 'PLANT_RECEPTION_SCHEDULE',
            'process_id' => $schedule->id,
            'event_code' => "PLANT_RECEPTION_SCHEDULE_{$eventCode}",
            'event_name' => "Cita de recepción en planta: {$eventCode}",
            'description' => $description,
            'previous_status' => null,
            'new_status' => $schedule->status,
            'severity' => 'INFO',
            'source' => 'api',
        ]);
    }
}
