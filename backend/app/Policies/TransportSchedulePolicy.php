<?php

namespace App\Policies;

use App\Models\Organization;
use App\Models\TransportSchedule;
use App\Models\User;

/**
 * Módulo Programación Logística (D-PRG-01 a D-PRG-14), Fase 2a. Acceso dual
 * simple (a diferencia de `ServiceRequestPolicy`, aquí NO hay acceso
 * cruzado): `transport_schedules.organization_id` es SIEMPRE la
 * organización que PROGRAMA (Gestor/Subgestor en Modalidad 1, o el propio
 * Generador con `business_role TRANSPORTER` en Modalidad 2, D-PRG-04) --
 * mismo criterio de aislamiento tenant-vs-platform-staff que
 * `Vehicle`/`TransportPersonnel`/`TransportRoute`.
 */
class TransportSchedulePolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('transport_schedules.read');
    }

    public function view(User $actor, TransportSchedule $schedule): bool
    {
        return $actor->hasPermission('transport_schedules.read') && $schedule->isAccessibleBy($actor);
    }

    /**
     * RN-090/D-PRG-04: la organización actora (Gestor/Subgestor, o Generador
     * con doble rol GENERATOR+TRANSPORTER) debe tener la capacidad de
     * negocio `can_transport_waste` -- mismo mecanismo exacto que
     * `ServiceRequestPolicy::create()` con `can_generate_waste`.
     */
    public function create(User $actor, ?int $organizationId = null): bool
    {
        if (! $actor->hasPermission('transport_schedules.create')) {
            return false;
        }

        if ($actor->isPlatformStaff()) {
            return true;
        }

        $organizationId ??= $actor->tenant_organization_id;
        $organization = Organization::query()->find($organizationId);

        return $organization !== null && $organization->hasCapability('can_transport_waste');
    }

    /**
     * Cubre TANTO la edición de campos de cabecera (PUT) COMO la
     * autorización base para disparar las transiciones de workflow
     * (`submit()`/`confirm()`) -- mismo criterio que
     * `ServiceRequestPolicy::update()`: dueño (o platform staff) y la
     * programación NO debe estar en un estado FINAL (`transport_statuses.is_final`).
     * La restricción MÁS estrecha de "solo mientras esté en Borrador/Pend."
     * para el PUT de cabecera vive en el controller, no aquí (ver docblock
     * de `TransportScheduleController::update()`).
     */
    public function update(User $actor, TransportSchedule $schedule): bool
    {
        return $actor->hasPermission('transport_schedules.update')
            && $schedule->isAccessibleBy($actor)
            && ! $schedule->transportStatus?->is_final;
    }

    public function cancel(User $actor, TransportSchedule $schedule): bool
    {
        return $actor->hasPermission('transport_schedules.cancel')
            && $schedule->isAccessibleBy($actor)
            && ! $schedule->transportStatus?->is_final;
    }
}
