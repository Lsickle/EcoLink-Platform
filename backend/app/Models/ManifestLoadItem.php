<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\ManifestLoadItemFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd (manifest_load_items) -- ver docblock de la migración
// create_manifest_load_items_table para el detalle completo de las
// decisiones aplicadas. Una fila = un residuo cargado, derivada
// automáticamente de un `transport_schedule_item` al crear el manifiesto
// (`ManifestLoadController::store()`) -- no se seleccionan a mano.
#[Fillable([
    'tenant_organization_id', 'manifest_load_id', 'transport_schedule_item_id',
    'waste_id', 'approved_treatment_id', 'declared_quantity', 'unit_of_measure',
    'actual_weight_kg', 'actual_volume_m3', 'container_quantity',
    'packaging_type', 'internal_container_code', 'packaging_condition',
    'transport_approved', 'special_handling_required', 'observations',
    'line_number', 'is_active', 'metadata', 'sync_status',
    'device_captured_at', 'offline_integrity_hash',
])]
class ManifestLoadItem extends Model
{
    /** @use HasFactory<ManifestLoadItemFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'declared_quantity' => 'decimal:3',
            'actual_weight_kg' => 'decimal:3',
            'actual_volume_m3' => 'decimal:3',
            'container_quantity' => 'integer',
            'transport_approved' => 'boolean',
            'special_handling_required' => 'boolean',
            'line_number' => 'integer',
            'is_active' => 'boolean',
            'metadata' => 'array',
            'device_captured_at' => 'datetime',
        ];
    }

    public function tenantOrganization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'tenant_organization_id');
    }

    public function manifestLoad(): BelongsTo
    {
        return $this->belongsTo(ManifestLoad::class);
    }

    public function transportScheduleItem(): BelongsTo
    {
        return $this->belongsTo(TransportScheduleItem::class);
    }

    public function waste(): BelongsTo
    {
        return $this->belongsTo(Waste::class);
    }

    public function approvedTreatment(): BelongsTo
    {
        return $this->belongsTo(WasteTreatmentApproval::class, 'approved_treatment_id');
    }
}
