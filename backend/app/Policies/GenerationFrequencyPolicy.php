<?php

namespace App\Policies;

use App\Models\GenerationFrequency;
use App\Models\User;

/**
 * Catálogo "Frecuencia de Generación", global -- sin
 * `tenant_organization_id`. `generation_frequencies.manage` cubre
 * create/update/activate/deactivate, mismo criterio que
 * `branch_types.manage`/`physical_states.manage`.
 */
class GenerationFrequencyPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('generation_frequencies.read');
    }

    public function view(User $actor, GenerationFrequency $generationFrequency): bool
    {
        return $actor->hasPermission('generation_frequencies.read');
    }

    public function create(User $actor): bool
    {
        return $actor->hasPermission('generation_frequencies.manage');
    }

    public function update(User $actor, GenerationFrequency $generationFrequency): bool
    {
        return $actor->hasPermission('generation_frequencies.manage');
    }
}
