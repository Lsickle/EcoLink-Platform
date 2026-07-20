<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\PlantReceptionScheduleFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd (plant_reception_schedules, D-PRG-02) -- Fase 4 "Cita de
// Recepción en Planta (bilateral)". Ver docblock de la migración
// create_plant_reception_schedules_table para el detalle completo (status
// VARCHAR libre a propósito, NO motor de Workflow genérico -- gestionado
// por `PlantReceptionScheduleService`).
//
// `status`/`confirmed_by`/`confirmed_at`/`counter_proposed_*`/
// `version_number`/`parent_schedule_id` se retiran deliberadamente del
// $fillable -- SOLO deben cambiar vía `PlantReceptionScheduleService`
// (forceFill()), nunca vía mass-assignment directo de un input externo.
#[Fillable([
    'tenant_organization_id', 'unload_request_id', 'receiving_branch_id',
    'dock_location_id', 'scheduled_date', 'scheduled_start_at',
    'scheduled_end_at', 'proposed_by_role', 'proposed_by_user_id',
    'proposed_at', 'reschedule_reason', 'rejection_reason', 'is_active',
    'metadata', 'created_by', 'updated_by',
])]
class PlantReceptionSchedule extends Model
{
    /** @use HasFactory<PlantReceptionScheduleFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    public const STATUS_PROPOSED = 'PROPOSED';

    public const STATUS_COUNTER_PROPOSED = 'COUNTER_PROPOSED';

    public const STATUS_CONFIRMED = 'CONFIRMED';

    public const STATUS_SUPERSEDED = 'SUPERSEDED';

    public const ROLE_LOGISTICS_COORDINATOR = 'LOGISTICS_COORDINATOR';

    public const ROLE_GENERATOR = 'GENERATOR';

    public const ROLE_RECEPTION_COORDINATOR = 'RECEPTION_COORDINATOR';

    protected function casts(): array
    {
        return [
            'scheduled_date' => 'date',
            'scheduled_start_at' => 'datetime',
            'scheduled_end_at' => 'datetime',
            'proposed_at' => 'datetime',
            'counter_proposed_date' => 'date',
            'counter_proposed_start_at' => 'datetime',
            'counter_proposed_end_at' => 'datetime',
            'counter_proposed_at' => 'datetime',
            'confirmed_at' => 'datetime',
            'version_number' => 'integer',
            'is_active' => 'boolean',
            'metadata' => 'array',
        ];
    }

    public function tenantOrganization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'tenant_organization_id');
    }

    public function unloadRequest(): BelongsTo
    {
        return $this->belongsTo(UnloadRequest::class);
    }

    public function receivingBranch(): BelongsTo
    {
        return $this->belongsTo(Branch::class, 'receiving_branch_id');
    }

    public function dockLocation(): BelongsTo
    {
        return $this->belongsTo(BranchLocation::class, 'dock_location_id');
    }

    public function proposedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'proposed_by_user_id');
    }

    public function counterProposedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'counter_proposed_by');
    }

    public function confirmedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'confirmed_by');
    }

    public function parentSchedule(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_schedule_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    /**
     * Eje de aislamiento: mismo criterio DUAL que
     * `UnloadRequest::isAccessibleBy()` -- se delega en la solicitud dueña.
     */
    public function isAccessibleBy(User $actor): bool
    {
        $this->loadMissing('unloadRequest');

        return $this->unloadRequest !== null && $this->unloadRequest->isAccessibleBy($actor);
    }
}
