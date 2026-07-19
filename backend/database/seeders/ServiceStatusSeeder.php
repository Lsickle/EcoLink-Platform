<?php

namespace Database\Seeders;

use App\Models\ServiceStatus;
use Illuminate\Database\Seeder;

/**
 * Catálogo BASE "service_statuses" (Módulo Solicitudes de Servicio, D-S02) --
 * 9 filas, `organization_id=NULL` (catálogo global/default, aplica a TODAS
 * las solicitudes salvo que una organización Gestor lo personalice vía
 * `organization_service_statuses`, fuera de alcance de este seeder).
 *
 * Seed EXACTO confirmado por D-S02 (`03-decisiones-validacion-arquitecto-datos.md`
 * / `01-decisiones-arquitecto-requisitos.md`): "El seed correcto del
 * catálogo global es el del Workflow/Catálogo de Estados oficial
 * (Draft/Submitted/UnderReview/Approved/Rejected/Scheduled/InExecution/
 * Completed/Cancelled)" -- el enum viejo del diccionario (con `QUOTED` y sin
 * `REJECTED`) queda descartado.
 *
 * `blocks_editing`: solo `DRAFT` permite edición libre (RN-SOL-006, D-S17 --
 * "modificar borrador" es editar la misma fila mientras esté en Draft); el
 * resto de estados bloquea edición directa.
 *
 * `is_terminal_status`: `REJECTED`/`COMPLETED`/`CANCELLED` -- aunque
 * `REJECTED` admite una transición de REAPERTURA hacia `DRAFT` (D-S23,
 * mismo patrón D-WF-05 ya usado en `WorkflowSeeder` para
 * `COM_APPROVED/COM_REJECTED -> COM_CANCELLED`: un estado puede ser
 * "terminal" del flujo normal y aun así tener una transición de salida
 * excepcional, modelada con `requires_approval=true`).
 */
class ServiceStatusSeeder extends Seeder
{
    /**
     * code => [name, sequence_order, is_initial, is_terminal, blocks_editing]
     */
    private const STATUSES = [
        'DRAFT' => ['Borrador', 1, true, false, false],
        'SUBMITTED' => ['Enviada', 2, false, false, true],
        'UNDER_REVIEW' => ['En Revisión', 3, false, false, true],
        'APPROVED' => ['Aprobada', 4, false, false, true],
        'REJECTED' => ['Rechazada', 5, false, true, true],
        'SCHEDULED' => ['Programada', 6, false, false, true],
        'IN_EXECUTION' => ['En Ejecución', 7, false, false, true],
        'COMPLETED' => ['Completada', 8, false, true, true],
        'CANCELLED' => ['Cancelada', 9, false, true, true],
    ];

    public function run(): void
    {
        foreach (self::STATUSES as $code => $definition) {
            [$name, $sequenceOrder, $isInitial, $isTerminal, $blocksEditing] = $definition;

            ServiceStatus::query()->updateOrCreate(
                ['organization_id' => null, 'code' => $code],
                [
                    'name' => $name,
                    'sequence_order' => $sequenceOrder,
                    'is_initial_status' => $isInitial,
                    'is_terminal_status' => $isTerminal,
                    'is_system_status' => true,
                    'blocks_editing' => $blocksEditing,
                    'is_active' => true,
                ],
            );
        }
    }
}
