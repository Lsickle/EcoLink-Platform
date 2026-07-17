<?php

namespace App\Policies;

use App\Models\User;
use App\Models\WasteOperationalStatus;

/**
 * Catálogo "Estado Operativo de Residuo", global -- sin
 * `tenant_organization_id`. `waste_operational_statuses.manage` cubre
 * create/update/activate/deactivate, mismo criterio que
 * `branch_types.manage`/`physical_states.manage`.
 */
class WasteOperationalStatusPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('waste_operational_statuses.read');
    }

    public function view(User $actor, WasteOperationalStatus $wasteOperationalStatus): bool
    {
        return $actor->hasPermission('waste_operational_statuses.read');
    }

    public function create(User $actor): bool
    {
        return $actor->hasPermission('waste_operational_statuses.manage');
    }

    public function update(User $actor, WasteOperationalStatus $wasteOperationalStatus): bool
    {
        return $actor->hasPermission('waste_operational_statuses.manage');
    }
}
