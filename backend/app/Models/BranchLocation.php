<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\BranchLocationFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd (branch_locations) -- Fase 4 "Cita de Recepción en Planta",
// CRUD mínimo acotado a "muelles" (ver docblock de la migración
// create_branch_locations_table para el detalle completo de por qué esta
// tabla NO incluye todavía las columnas de canvas 2D de almacenamiento).
#[Fillable([
    'tenant_organization_id', 'branch_id', 'code', 'name', 'is_active',
    'created_by', 'updated_by',
])]
class BranchLocation extends Model
{
    /** @use HasFactory<BranchLocationFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    public function tenantOrganization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'tenant_organization_id');
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
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
     * Eje de aislamiento: se deriva de la organización dueña de la sede
     * (`branch_id.organization_id`), mismo criterio que `Vehicle`/`Branch`.
     */
    public function isAccessibleBy(User $actor): bool
    {
        return $actor->isPlatformStaff() || $this->organizationId() === $actor->tenant_organization_id;
    }

    public function organizationId(): ?int
    {
        $this->loadMissing('branch');

        return $this->branch?->organization_id;
    }
}
