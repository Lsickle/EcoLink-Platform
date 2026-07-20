<?php

namespace App\Services;

use App\Models\ManifestLoad;
use App\Models\TransportSchedule;
use App\Models\UnloadRequest;
use App\Models\UnloadRequestItem;
use App\Models\UnloadRequestStatus;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * D-PRG-13 -- automatización DIRECTA en código de aplicación (NO un motor
 * genérico de acciones automáticas, ver punto 4 del enunciado de esta
 * tarea: ese motor fue diferido explícitamente por falta de un segundo caso
 * de uso real; construirlo solo para esto sería sobre-ingeniería).
 *
 * Disparada por `TransportScheduleController::confirm()` al alcanzar `CONF`
 * -- crea automáticamente un `unload_requests` derivado de la programación
 * recién confirmada.
 *
 * DECISIÓN de estado inicial (a decidir y documentar por esta tarea): la
 * fila nace DIRECTAMENTE en `SUBMITTED` (no `DRAFT`) -- "la programación
 * confirmada implica intención real" (razonamiento sugerido por la propia
 * tarea). Se construye vía `forceFill()` directo del estado inicial, EXACTO
 * mismo criterio que `ManifestLoadController::store()`/
 * `TransportScheduleController::store()` fijan su estado inicial (DRAFT/BOR)
 * sin pasar por el motor de transiciones -- "crear" un registro no es una
 * transición, es fijar su valor de partida; por eso NO se invoca
 * `UnloadRequestWorkflowService::transition()` aquí (evita el conflicto de
 * autorización: la transición humana DRAFT->SUBMITTED está sembrada con rol
 * LOGÍSTICA para el flujo MANUAL de `UnloadRequestController::submit()`,
 * pero la automatización no tiene "actor humano autorizando" en el sentido
 * del motor de Workflow -- el propio TransportSchedule::confirm() ya pasó
 * su propia autorización de rol antes de disparar esto).
 *
 * `manifest_load_id`: NULL en la inmensa mayoría de los casos -- en este
 * punto del flujo (justo al confirmar la programación) todavía no existe
 * ningún `manifest_loads` para ella (`ManifestLoadController::store()` se
 * invoca DESPUÉS, a mano, por el mismo actor Gestor/Logística). Se busca de
 * todos modos por completitud (defensivo, sin asumir orden estricto de
 * operaciones) -- si existiera uno ACTIVO para esta programación, se
 * vincula.
 *
 * `service_modality` (D-RCP-02/D-PRG-04): SELF_TRANSPORT si
 * `transport_schedule.organization_id` (quien programó/transporta) es la
 * MISMA organización dueña de `source_branch_id` (la Generadora real) --
 * autotransporte; COLLECTION en caso contrario.
 *
 * Ítems: derivados 1:1 de `transport_schedule_items` (fuente de verdad de
 * qué se transporta, exista o no un manifiesto de cargue todavía) --
 * `manifest_load_item_id` queda NULL (no hay manifiesto en este punto, ver
 * arriba).
 */
class UnloadRequestAutomationService
{
    /**
     * Hallazgo Medio (revisión de seguridad "Cita de Recepción en Planta
     * bilateral", 2026-07-19): el pre-chequeo de abajo (`where(...)->first()`)
     * es un check-then-act de aplicación -- da idempotencia en el caso
     * normal (secuencial), pero NO cubre la condición de carrera real (2
     * confirmaciones concurrentes de la MISMA `TransportSchedule`, doble
     * clic o reintento de red). La red de seguridad real es el índice único
     * parcial `unload_requests_active_unique` (`transport_schedule_id`
     * `WHERE deleted_at IS NULL`) + el try/catch(UniqueConstraintViolationException)
     * de abajo -- mismo patrón que `ManifestLoadController::store()`/
     * `TransportScheduleController::store()`, con una diferencia clave: esto
     * es una AUTOMATIZACIÓN interna (no una acción directa de un usuario),
     * así que el resultado de la carrera debe ser idempotencia REAL --
     * recuperar y devolver la fila ya creada por la otra invocación
     * concurrente -- en vez de un error 422 (que sí es el criterio correcto
     * para las otras 2 tablas, donde SÍ es un error del usuario intentando
     * duplicar un documento a mano).
     */
    public static function createFromConfirmedSchedule(TransportSchedule $transportSchedule, User $actor): UnloadRequest
    {
        $existing = self::findExistingForSchedule($transportSchedule->id);

        if ($existing !== null) {
            return $existing;
        }

        $transportSchedule->loadMissing(['sourceBranch', 'items.measurementUnit']);

        $carrierOrganizationId = $transportSchedule->organization_id;
        $generatorOrganizationId = $transportSchedule->sourceBranch?->organization_id;

        $serviceModality = ($generatorOrganizationId !== null && $generatorOrganizationId === $carrierOrganizationId)
            ? UnloadRequest::MODALITY_SELF_TRANSPORT
            : UnloadRequest::MODALITY_COLLECTION;

        $manifestLoadId = ManifestLoad::query()
            ->where('transport_schedule_id', $transportSchedule->id)
            ->where('is_active', true)
            ->value('id');

        $submittedStatusId = UnloadRequestStatus::query()->where('code', 'SUBMITTED')->value('id');

        if ($submittedStatusId === null) {
            throw new \LogicException("Catálogo unload_request_statuses sin el valor 'SUBMITTED' sembrado.");
        }

        try {
            return DB::transaction(function () use ($transportSchedule, $actor, $carrierOrganizationId, $serviceModality, $manifestLoadId, $submittedStatusId) {
                $unloadRequest = new UnloadRequest;
                $unloadRequest->fill([
                    'tenant_organization_id' => $carrierOrganizationId,
                    'request_number' => self::generateRequestNumber($carrierOrganizationId),
                    'receiving_branch_id' => $transportSchedule->destination_branch_id,
                    'manifest_load_id' => $manifestLoadId,
                    'transport_schedule_id' => $transportSchedule->id,
                    'origin_branch_id' => $transportSchedule->source_branch_id,
                    'carrier_organization_id' => $carrierOrganizationId,
                    'vehicle_id' => $transportSchedule->vehicle_id,
                    'transport_personnel_id' => $transportSchedule->transport_personnel_id,
                    'service_modality' => $serviceModality,
                    'estimated_arrival_at' => $transportSchedule->planned_arrival_at,
                    'priority' => $transportSchedule->priority,
                    'is_active' => true,
                ]);
                $unloadRequest->forceFill([
                    'unload_request_status_id' => $submittedStatusId,
                    'submitted_at' => now(),
                    'created_by' => $actor->id,
                    'updated_by' => $actor->id,
                ]);
                $unloadRequest->save();

                foreach ($transportSchedule->items as $scheduleItem) {
                    UnloadRequestItem::query()->create([
                        'tenant_organization_id' => $unloadRequest->tenant_organization_id,
                        'unload_request_id' => $unloadRequest->id,
                        'manifest_load_item_id' => null,
                        'waste_id' => $scheduleItem->waste_id,
                        'requested_quantity' => $scheduleItem->scheduled_quantity,
                        'unit_of_measure' => $scheduleItem->measurementUnit?->code ?? 'KG',
                        'packaging_type' => $scheduleItem->packaging_type,
                        'is_active' => true,
                    ]);
                }

                return $unloadRequest;
            });
        } catch (UniqueConstraintViolationException) {
            // Idempotencia REAL (no un 422): la condición de carrera real (2
            // confirmaciones concurrentes) -- la otra transacción concurrente
            // ya insertó la fila y commiteó antes que esta; se recupera y
            // devuelve, en vez de propagar el error al actor (esto es una
            // automatización interna, no una acción directa del usuario que
            // esté duplicando algo por error).
            $existing = self::findExistingForSchedule($transportSchedule->id);

            if ($existing === null) {
                throw new \LogicException(
                    "Violación de unicidad en unload_requests.transport_schedule_id={$transportSchedule->id} sin fila existente recuperable."
                );
            }

            return $existing;
        }
    }

    private static function findExistingForSchedule(int $transportScheduleId): ?UnloadRequest
    {
        return UnloadRequest::query()->where('transport_schedule_id', $transportScheduleId)->first();
    }

    private static function generateRequestNumber(int $carrierOrganizationId): string
    {
        do {
            $code = sprintf('SOL-%d-%s', $carrierOrganizationId, Str::upper(Str::random(8)));
        } while (UnloadRequest::withTrashed()->where('tenant_organization_id', $carrierOrganizationId)->where('request_number', $code)->exists());

        return $code;
    }
}
