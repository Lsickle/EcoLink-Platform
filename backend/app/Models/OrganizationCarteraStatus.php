<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\OrganizationCarteraStatusFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd (D-S04/D-S12): organization_cartera_statuses -- estado de
// cartera BILATERAL entre un Generador (`generator_organization_id`) y un
// Gestor (`gestor_organization_id`) específicos. UN SOLO registro VIGENTE
// por par (D-S12) -- se actualiza in-place, historial vía `audit_logs`. Ver
// docblock de la migración create_organization_cartera_statuses_table.
#[Fillable([
    'generator_organization_id', 'gestor_organization_id', 'cartera_status_id',
    'reason', 'blocked_at', 'blocked_by', 'unblocked_at', 'unblocked_by',
    'observations', 'is_active', 'metadata', 'created_by', 'updated_by',
])]
class OrganizationCarteraStatus extends Model
{
    /** @use HasFactory<OrganizationCarteraStatusFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'blocked_at' => 'datetime',
            'unblocked_at' => 'datetime',
            'is_active' => 'boolean',
            'metadata' => 'array',
        ];
    }

    public function generatorOrganization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'generator_organization_id');
    }

    public function gestorOrganization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'gestor_organization_id');
    }

    public function carteraStatus(): BelongsTo
    {
        return $this->belongsTo(CarteraStatus::class);
    }

    public function blockedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'blocked_by');
    }

    public function unblockedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'unblocked_by');
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
     * D-S04: validación de aplicación al crear un ítem de solicitud dirigido
     * a un Gestor -- consumida por la futura capa de orquestación de
     * Solicitudes (D-S27), NO por este modelo directamente.
     */
    public function blocksNewRequests(): bool
    {
        return $this->is_active && $this->carteraStatus?->blocks_new_requests === true;
    }
}
