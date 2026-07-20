<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\UnloadRequestFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd (unload_requests, D-PRG-02) -- Fase 4 "Cita de Recepción en
// Planta". Ver docblock de la migración create_unload_requests_table para
// el detalle completo de las decisiones aplicadas (entity_type=TRANSPORT,
// service_modality explícita D-RCP-02, FKs nullable D-PRG-02).
//
// `unload_request_status_id`/`submitted_at`/`decided_by`/`decided_at`/
// `rejection_reason` se retiran deliberadamente del $fillable -- mismo
// criterio que `TransportSchedule::transport_status_id`: solo deben cambiar
// vía `UnloadRequestWorkflowService::transition()`/
// `UnloadRequestController::approve()`/`reject()` (forceFill()), nunca vía
// mass-assignment directo de un input externo.
#[Fillable([
    'tenant_organization_id', 'request_number', 'receiving_branch_id',
    'manifest_load_id', 'transport_schedule_id', 'origin_branch_id',
    'carrier_organization_id', 'vehicle_id', 'transport_personnel_id',
    'service_modality', 'estimated_arrival_at', 'priority',
    'transport_discrepancy_notes', 'is_active', 'metadata', 'created_by',
    'updated_by',
])]
class UnloadRequest extends Model
{
    /** @use HasFactory<UnloadRequestFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    public const MODALITY_COLLECTION = 'COLLECTION';

    public const MODALITY_SELF_TRANSPORT = 'SELF_TRANSPORT';

    protected function casts(): array
    {
        return [
            'estimated_arrival_at' => 'datetime',
            'submitted_at' => 'datetime',
            'decided_at' => 'datetime',
            'is_active' => 'boolean',
            'metadata' => 'array',
        ];
    }

    public function tenantOrganization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'tenant_organization_id');
    }

    public function unloadRequestStatus(): BelongsTo
    {
        return $this->belongsTo(UnloadRequestStatus::class);
    }

    public function receivingBranch(): BelongsTo
    {
        return $this->belongsTo(Branch::class, 'receiving_branch_id');
    }

    public function manifestLoad(): BelongsTo
    {
        return $this->belongsTo(ManifestLoad::class);
    }

    public function transportSchedule(): BelongsTo
    {
        return $this->belongsTo(TransportSchedule::class);
    }

    public function originBranch(): BelongsTo
    {
        return $this->belongsTo(Branch::class, 'origin_branch_id');
    }

    public function carrierOrganization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'carrier_organization_id');
    }

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class);
    }

    public function transportPersonnel(): BelongsTo
    {
        return $this->belongsTo(TransportPersonnel::class);
    }

    public function decidedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'decided_by');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function items(): HasMany
    {
        return $this->hasMany(UnloadRequestItem::class);
    }

    /**
     * "Vigente" = la última `plant_reception_schedule` con `is_active=true`
     * para esta solicitud -- ver `plant_reception_schedules_active_unique`
     * (índice único parcial, garantiza como máximo UNA fila activa).
     */
    public function activeReceptionSchedule(): HasOne
    {
        return $this->hasOne(PlantReceptionSchedule::class)->where('is_active', true);
    }

    public function receptionSchedules(): HasMany
    {
        return $this->hasMany(PlantReceptionSchedule::class);
    }

    /**
     * Organización RECEPTORA (dueña de `receiving_branch_id`) -- el Gestor
     * que decide Aprobar/Rechazar la solicitud y coordina la cita.
     */
    public function receivingOrganizationId(): ?int
    {
        $this->loadMissing('receivingBranch');

        return $this->receivingBranch?->organization_id;
    }

    /**
     * Eje de aislamiento: acceso DUAL NO simétrico, mismo criterio que
     * `ManifestLoad::isAccessibleBy()` -- AMBOS lados (transportador/
     * `carrier_organization_id` y receptor/`receivingOrganizationId()`)
     * pueden VER la solicitud; quién puede DECIDIR/gestionar cada acción
     * concreta vive en `UnloadRequestPolicy` (más fino que un simple
     * booleano de acceso).
     */
    public function isAccessibleBy(User $actor): bool
    {
        return $actor->isPlatformStaff()
            || ($this->carrier_organization_id !== null && $this->carrier_organization_id === $actor->tenant_organization_id)
            || $this->receivingOrganizationId() === $actor->tenant_organization_id;
    }
}
