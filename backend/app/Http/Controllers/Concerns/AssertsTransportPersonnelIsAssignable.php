<?php

namespace App\Http\Controllers\Concerns;

use App\Models\TransportPersonnel;
use Illuminate\Validation\ValidationException;

/**
 * Regla ÚNICA de "personal de transporte asignable" (decisión del usuario,
 * 2026-10-12), compartida por `TransportScheduleController` (crear, editar y
 * confirmar una programación) y `UnloadRequestController` (solicitud de
 * descargue manual) -- antes vivía solo en el primero y la solicitud manual
 * validaba únicamente pertenencia.
 *
 * Pertenecer a la organización (`transport_personnel.organization_id`) no
 * basta: el registro debe existir (un soft-deleted no cuenta), estar activo
 * (`transport_personnel.is_active`) y su `Person` conservar un vínculo ACTIVO
 * en `organization_contacts` con esa organización -- mismo criterio que
 * `TransportPersonnelController::assertPersonBelongsToOrganization()`, vía
 * `organizationLinks()`, nunca la columna legacy `people.organization_id`.
 * Sin esto, un conductor dado de baja o cuya persona fue desvinculada de la
 * empresa seguía siendo asignable.
 */
trait AssertsTransportPersonnelIsAssignable
{
    /**
     * Para ASIGNAR personal (crear/editar): 422 sobre `$field` si no es
     * asignable. `$field` distingue conductor (`transport_personnel_id`) de
     * auxiliar (`assistant_personnel_id`) en la clave y en el mensaje.
     */
    protected function assertTransportPersonnelIsAssignable(int $transportPersonnelId, ?int $organizationId, string $field = 'transport_personnel_id'): void
    {
        $problem = $this->transportPersonnelAssignabilityProblem($transportPersonnelId, $organizationId);

        if ($problem !== null) {
            $label = $this->transportPersonnelFieldLabel($field);

            throw ValidationException::withMessages([
                $field => ["El {$label} indicado {$problem}."],
            ]);
        }
    }

    /**
     * Para REVALIDAR personal ya asignado antes de comprometer la operación
     * (confirmar una programación): misma regla, pero el mensaje indica que
     * debe reasignarse.
     */
    protected function assertAssignedTransportPersonnelIsStillAssignable(int $transportPersonnelId, ?int $organizationId, string $field = 'transport_personnel_id'): void
    {
        $problem = $this->transportPersonnelAssignabilityProblem($transportPersonnelId, $organizationId);

        if ($problem !== null) {
            $label = $this->transportPersonnelFieldLabel($field);

            throw ValidationException::withMessages([
                $field => ["El {$label} asignado {$problem}. Debe reasignarse antes de confirmar la programación."],
            ]);
        }
    }

    /**
     * Motivo (frase en español, sin sujeto) por el que el registro NO es
     * asignable para `$organizationId`, o `null` si lo es.
     */
    private function transportPersonnelAssignabilityProblem(int $transportPersonnelId, ?int $organizationId): ?string
    {
        $personnel = TransportPersonnel::query()->find($transportPersonnelId);

        if (! $personnel || $organizationId === null || (int) $personnel->organization_id !== $organizationId) {
            return 'no pertenece a su organización';
        }

        if (! $personnel->is_active) {
            return 'está inactivo y no puede asignarse';
        }

        $isLinked = $personnel->person?->organizationLinks()
            ->where('organization_id', $organizationId)
            ->where('is_active', true)
            ->exists() ?? false;

        return $isLinked ? null : 'ya no está vinculado a su organización';
    }

    private function transportPersonnelFieldLabel(string $field): string
    {
        return $field === 'assistant_personnel_id' ? 'auxiliar' : 'conductor';
    }
}
