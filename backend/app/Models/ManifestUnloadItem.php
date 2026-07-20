<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\ManifestUnloadItemFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd (manifest_unload_items) -- ver docblock de la migración
// create_manifest_unload_items_table para el detalle completo. Una fila = un
// residuo descargado, derivada automáticamente de un `unload_request_item`
// al crear el manifiesto (`ManifestUnloadController::store()`) con
// cantidades declaradas en 0 -- editada después por
// `ManifestUnloadController::inspectItems()` (inspección física, ANTES de
// generate()).
#[Fillable([
    'tenant_organization_id', 'manifest_unload_id', 'manifest_load_item_id',
    'unload_request_item_id', 'waste_id', 'received_quantity',
    'rejected_quantity', 'unit_of_measure', 'received_weight_kg',
    'rejected_weight_kg', 'received_volume_m3', 'received_container_quantity',
    'reception_condition', 'rejection_reason', 'inspection_approved',
    'storage_location_id', 'received_at', 'observations', 'line_number',
    'is_active', 'metadata', 'sync_status', 'device_captured_at',
    'offline_integrity_hash',
])]
class ManifestUnloadItem extends Model
{
    /** @use HasFactory<ManifestUnloadItemFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'received_quantity' => 'decimal:3',
            'rejected_quantity' => 'decimal:3',
            'received_weight_kg' => 'decimal:3',
            'rejected_weight_kg' => 'decimal:3',
            'received_volume_m3' => 'decimal:3',
            'received_container_quantity' => 'integer',
            'inspection_approved' => 'boolean',
            'received_at' => 'datetime',
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

    public function manifestUnload(): BelongsTo
    {
        return $this->belongsTo(ManifestUnload::class);
    }

    public function manifestLoadItem(): BelongsTo
    {
        return $this->belongsTo(ManifestLoadItem::class);
    }

    public function unloadRequestItem(): BelongsTo
    {
        return $this->belongsTo(UnloadRequestItem::class);
    }

    public function waste(): BelongsTo
    {
        return $this->belongsTo(Waste::class);
    }

    public function storageLocation(): BelongsTo
    {
        return $this->belongsTo(BranchLocation::class, 'storage_location_id');
    }
}
