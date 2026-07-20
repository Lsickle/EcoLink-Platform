<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\GestorCarrierAuthorizationFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

// Módulo Programación Logística, Fase 4 (hallazgo especialista-seguridad,
// "Modalidad 3" -- Transportador independiente contratado por un Gestor).
// Ver docblock de la migración create_gestor_carrier_authorizations_table
// para el detalle completo de las decisiones aplicadas (mismo patrón que
// `OrganizationCarteraStatus`, D-S04/D-S12).
//
// `authorized_by`/`authorized_at`/`revoked_by`/`revoked_at`/`is_active` se
// retiran deliberadamente del $fillable -- mismo criterio que
// `TransportSchedule::transport_status_id`: solo deben cambiar vía la lógica
// dedicada del controller (`GestorCarrierAuthorizationController::store()`/
// `revoke()`), nunca vía mass-assignment directo.
#[Fillable([
    'gestor_organization_id', 'carrier_organization_id', 'observations',
    'metadata', 'created_by', 'updated_by',
])]
class GestorCarrierAuthorization extends Model
{
    /** @use HasFactory<GestorCarrierAuthorizationFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'authorized_at' => 'datetime',
            'revoked_at' => 'datetime',
            'is_active' => 'boolean',
            'metadata' => 'array',
        ];
    }

    public function gestorOrganization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'gestor_organization_id');
    }

    public function carrierOrganization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'carrier_organization_id');
    }

    public function authorizedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'authorized_by');
    }

    public function revokedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'revoked_by');
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
     * Acceso DUAL (mismo criterio que `ManifestLoad`/`UnloadRequest`): AMBOS
     * lados -- el Gestor que autoriza Y el Transportador autorizado -- pueden
     * VER el registro; quién puede crear/revocar (solo el Gestor dueño) vive
     * en `GestorCarrierAuthorizationPolicy`.
     */
    public function isAccessibleBy(User $actor): bool
    {
        return $actor->isPlatformStaff()
            || $this->gestor_organization_id === $actor->tenant_organization_id
            || $this->carrier_organization_id === $actor->tenant_organization_id;
    }
}
