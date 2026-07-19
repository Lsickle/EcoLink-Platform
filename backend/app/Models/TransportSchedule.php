<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\TransportScheduleFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd (transport_schedules) + Módulo Programación Logística
// (D-PRG-01 a D-PRG-14): ver docblock de la migración
// create_transport_schedules_table para el detalle completo de las
// decisiones aplicadas.
//
// `transport_status_id` se retira deliberadamente del $fillable -- mismo
// criterio que `WasteServiceRequest::service_status_id`: solo debe cambiar
// vía las futuras transiciones de workflow dedicadas (siguiente tarea:
// controller), nunca vía mass-assignment directo.
#[Fillable([
    'tenant_organization_id', 'organization_id', 'waste_service_request_id',
    'schedule_number', 'source_branch_id', 'destination_branch_id',
    'vehicle_id', 'transport_personnel_id', 'responsible_user_id',
    'scheduled_pickup_at', 'pickup_window_start', 'pickup_window_end',
    'priority', 'estimated_weight_kg', 'estimated_volume_m3',
    'planned_distance_km', 'planned_duration_minutes',
    'requires_special_handling', 'observations', 'version_number',
    'parent_schedule_id', 'is_active', 'metadata', 'created_by', 'updated_by',
])]
class TransportSchedule extends Model
{
    /** @use HasFactory<TransportScheduleFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'scheduled_pickup_at' => 'datetime',
            'pickup_window_start' => 'datetime',
            'pickup_window_end' => 'datetime',
            'estimated_weight_kg' => 'decimal:3',
            'estimated_volume_m3' => 'decimal:3',
            'planned_distance_km' => 'decimal:2',
            'planned_duration_minutes' => 'integer',
            'requires_special_handling' => 'boolean',
            'version_number' => 'integer',
            'is_active' => 'boolean',
            'metadata' => 'array',
        ];
    }

    public function tenantOrganization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'tenant_organization_id');
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function wasteServiceRequest(): BelongsTo
    {
        return $this->belongsTo(WasteServiceRequest::class);
    }

    public function transportStatus(): BelongsTo
    {
        return $this->belongsTo(TransportStatus::class);
    }

    public function sourceBranch(): BelongsTo
    {
        return $this->belongsTo(Branch::class, 'source_branch_id');
    }

    public function destinationBranch(): BelongsTo
    {
        return $this->belongsTo(Branch::class, 'destination_branch_id');
    }

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class);
    }

    public function transportPersonnel(): BelongsTo
    {
        return $this->belongsTo(TransportPersonnel::class);
    }

    public function responsibleUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'responsible_user_id');
    }

    public function parentSchedule(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_schedule_id');
    }

    public function childSchedules(): HasMany
    {
        return $this->hasMany(self::class, 'parent_schedule_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(TransportScheduleItem::class);
    }

    public function routeStop(): HasOne
    {
        return $this->hasOne(TransportRouteStop::class);
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
     * Eje de aislamiento tenant-vs-platform-staff -- mismo criterio y misma
     * firma que `WasteServiceRequest::isAccessibleBy()`.
     */
    public function isAccessibleBy(User $actor): bool
    {
        return $actor->isPlatformStaff() || $this->organization_id === $actor->tenant_organization_id;
    }
}
