<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\WasteServiceRequestFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd (Módulo Solicitudes de Servicio, cabecera): waste_service_requests
// -- solicitud operativa de recolección/disposición del Generador
// (`organization_id`). El/los Gestor(es) destino se fijan POR ÍTEM
// (D-S01, ver WasteServiceRequestItem::wasteTreatmentApproval()), esta
// cabecera no tiene columna "Gestor destino" propia. `service_status_id`
// (D-S02) es el estado agregado de la solicitud completa -- la regla de
// agregado cabecera<->ítems de D-S01 (una solicitud solo pasa a Approved
// cuando TODOS sus ítems tienen aprobación vigente) es responsabilidad de
// una futura capa de orquestación (D-S27), NO de este modelo ni del motor
// de Workflow genérico.
//
// `service_status_id`/`cancellation_reason_id`/`cancelled_by`/`created_by`/
// `updated_by` se retiran deliberadamente del $fillable, mismo criterio que
// `Waste::status` -- estas columnas reflejan el estado del ciclo de vida de
// la solicitud y solo deben cambiar vía las futuras transiciones de
// workflow dedicadas (siguiente tarea), nunca vía mass-assignment directo
// de un store()/update() genérico.
#[Fillable([
    'tenant_organization_id', 'organization_id', 'branch_id', 'request_code',
    'requested_at', 'requested_collection_date', 'estimated_ready_date',
    'scheduled_collection_date', 'estimated_total_weight', 'estimated_total_volume',
    'measurement_unit_id', 'packaging_type', 'requires_lift_platform', 'requires_audit',
    'requires_photo_record', 'requires_container_return', 'estimated_height',
    'estimated_width', 'estimated_length', 'observations', 'request_source',
    'priority', 'requested_by', 'is_active', 'metadata',
])]
class WasteServiceRequest extends Model
{
    /** @use HasFactory<WasteServiceRequestFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'requested_at' => 'datetime',
            'requested_collection_date' => 'date',
            'estimated_ready_date' => 'date',
            'scheduled_collection_date' => 'datetime',
            'estimated_total_weight' => 'decimal:2',
            'estimated_total_volume' => 'decimal:2',
            'requires_lift_platform' => 'boolean',
            'requires_audit' => 'boolean',
            'requires_photo_record' => 'boolean',
            'requires_container_return' => 'boolean',
            'estimated_height' => 'decimal:2',
            'estimated_width' => 'decimal:2',
            'estimated_length' => 'decimal:2',
            'cancelled_at' => 'datetime',
            'is_active' => 'boolean',
            'metadata' => 'array',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function serviceStatus(): BelongsTo
    {
        return $this->belongsTo(ServiceStatus::class);
    }

    public function measurementUnit(): BelongsTo
    {
        return $this->belongsTo(MeasurementUnit::class);
    }

    public function cancellationReason(): BelongsTo
    {
        return $this->belongsTo(CancellationReason::class);
    }

    public function requestedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function cancelledBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cancelled_by');
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
        return $this->hasMany(WasteServiceRequestItem::class, 'service_request_id');
    }

    /**
     * Eje de aislamiento tenant-vs-platform-staff -- mismo criterio y misma
     * firma que `Waste::isAccessibleBy()`/`Branch::isAccessibleBy()`.
     */
    public function isAccessibleBy(User $actor): bool
    {
        return $actor->isPlatformStaff() || $this->organization_id === $actor->tenant_organization_id;
    }
}
