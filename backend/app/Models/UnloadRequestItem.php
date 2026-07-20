<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\UnloadRequestItemFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd (unload_request_items, D-PRG-02) -- Fase 4. Detalle de
// residuos de una `unload_request`.
#[Fillable([
    'tenant_organization_id', 'unload_request_id', 'manifest_load_item_id',
    'waste_id', 'requested_quantity', 'unit_of_measure', 'packaging_type',
    'line_number', 'is_active', 'metadata', 'created_by', 'updated_by',
])]
class UnloadRequestItem extends Model
{
    /** @use HasFactory<UnloadRequestItemFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'requested_quantity' => 'decimal:3',
            'line_number' => 'integer',
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

    public function manifestLoadItem(): BelongsTo
    {
        return $this->belongsTo(ManifestLoadItem::class);
    }

    public function waste(): BelongsTo
    {
        return $this->belongsTo(Waste::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
