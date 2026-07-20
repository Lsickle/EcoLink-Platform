<?php

namespace App\Policies;

use App\Models\PlantReceptionSchedule;
use App\Models\UnloadRequest;
use App\Models\User;

/**
 * Fase 4 "Cita de Recepción en Planta (bilateral)" -- `plant_reception_schedules`.
 * A diferencia de `UnloadRequestPolicy` (decisión de Aprobar/Rechazar
 * exclusiva del lado receptor), AQUÍ ambos lados (transportador y receptor)
 * tienen el MISMO nivel de acceso para proponer/contraproponer/confirmar/
 * reprogramar -- es una coordinación BILATERAL por diseño (punto 5 del
 * enunciado: "puede leer + contraproponer/confirmar franjas").
 */
class PlantReceptionSchedulePolicy
{
    /**
     * Chequeo GRUESO para `index()` (agenda general) -- el filtrado FINO por
     * fila (qué franjas concretas puede ver el actor dentro de la sede
     * consultada) vive en el controller, mismo patrón que
     * `UnloadRequestPolicy::viewAny()`/`TransportSchedulePolicy::viewAny()`.
     */
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('plant_reception_schedules.read');
    }

    public function view(User $actor, PlantReceptionSchedule $schedule): bool
    {
        return $actor->hasPermission('plant_reception_schedules.read') && $schedule->isAccessibleBy($actor);
    }

    /**
     * `propose()` se autoriza sobre la `UnloadRequest` (todavía no existe
     * una fila de `PlantReceptionSchedule` propia).
     */
    public function proposeOn(User $actor, UnloadRequest $unloadRequest): bool
    {
        return $actor->hasPermission('plant_reception_schedules.manage') && $unloadRequest->isAccessibleBy($actor);
    }

    /**
     * Cubre `counterPropose()`/`confirm()`/`reschedule()` -- cualquiera de
     * los 2 lados accesibles a la solicitud dueña.
     */
    public function manage(User $actor, PlantReceptionSchedule $schedule): bool
    {
        return $actor->hasPermission('plant_reception_schedules.manage') && $schedule->isAccessibleBy($actor);
    }
}
