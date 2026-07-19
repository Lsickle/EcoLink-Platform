<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\TransportScheduleItemFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd (transport_schedule_items): ver docblock de la migración
// create_transport_schedule_items_table para el detalle completo.
#[Fillable([
    'tenant_organization_id', 'transport_schedule_id', 'waste_service_request_item_id',
    'waste_id', 'scheduled_quantity', 'measurement_unit_id', 'estimated_weight_kg',
    'estimated_volume_m3', 'container_quantity', 'packaging_type', 'length_cm',
    'width_cm', 'height_cm', 'requires_special_handling', 'observations',
    'is_active', 'metadata',
])]
class TransportScheduleItem extends Model
{
    /** @use HasFactory<TransportScheduleItemFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'scheduled_quantity' => 'decimal:3',
            'estimated_weight_kg' => 'decimal:3',
            'estimated_volume_m3' => 'decimal:3',
            'container_quantity' => 'integer',
            'length_cm' => 'decimal:2',
            'width_cm' => 'decimal:2',
            'height_cm' => 'decimal:2',
            'requires_special_handling' => 'boolean',
            'is_active' => 'boolean',
            'metadata' => 'array',
        ];
    }

    public function transportSchedule(): BelongsTo
    {
        return $this->belongsTo(TransportSchedule::class);
    }

    public function wasteServiceRequestItem(): BelongsTo
    {
        return $this->belongsTo(WasteServiceRequestItem::class);
    }

    public function waste(): BelongsTo
    {
        return $this->belongsTo(Waste::class);
    }

    public function measurementUnit(): BelongsTo
    {
        return $this->belongsTo(MeasurementUnit::class);
    }
}
