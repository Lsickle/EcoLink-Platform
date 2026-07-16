<?php

namespace App\Policies;

use App\Models\User;
use App\Models\Vehicle;

/**
 * CRUD de Vehículos vs. CU-051.1/.2/.3/.4. Acceso dual: platform staff
 * gestiona TODOS los vehículos; un admin de tenant o un usuario con rol
 * LOGÍSTICA solo los de su propia organización -- ver
 * `Vehicle::isAccessibleBy()`. Mismo patrón exacto que `BranchPolicy`.
 *
 * `LOGÍSTICA` es SOLO de lectura sobre vehículos (decisión ya confirmada):
 * el permiso `vehicles.read` se asigna a ADMINISTRADOR y LOGÍSTICA;
 * `vehicles.create`/`.update`/`.activate`/`.deactivate` van SOLO a
 * ADMINISTRADOR -- ver RolePermissionSeeder, no se distingue aquí por rol,
 * solo por el permiso efectivo del actor (mismo criterio que el resto del
 * RBAC del proyecto).
 */
class VehiclePolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('vehicles.read');
    }

    public function view(User $actor, Vehicle $vehicle): bool
    {
        return $actor->hasPermission('vehicles.read') && $vehicle->isAccessibleBy($actor);
    }

    public function create(User $actor): bool
    {
        return $actor->hasPermission('vehicles.create');
    }

    public function update(User $actor, Vehicle $vehicle): bool
    {
        return $actor->hasPermission('vehicles.update') && $vehicle->isAccessibleBy($actor);
    }
}
