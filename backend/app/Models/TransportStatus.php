<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\TransportStatusFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd (transport_statuses) + D-PRG-08/D-PRG-11: catálogo de estados
// de `transport_schedules` -- ver docblock de la migración
// create_transport_statuses_table para el detalle completo.
#[Fillable([
    'tenant_organization_id', 'code', 'name', 'description', 'sort_order',
    'is_initial', 'is_final', 'requires_schedule', 'requires_vehicle',
    'requires_load_manifest', 'requires_unload_manifest', 'color_hex',
    'icon', 'is_active', 'metadata',
])]
class TransportStatus extends Model
{
    /** @use HasFactory<TransportStatusFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'sort_order' => 'integer',
            'is_initial' => 'boolean',
            'is_final' => 'boolean',
            'requires_schedule' => 'boolean',
            'requires_vehicle' => 'boolean',
            'requires_load_manifest' => 'boolean',
            'requires_unload_manifest' => 'boolean',
            'is_active' => 'boolean',
            'metadata' => 'array',
        ];
    }

    public function tenantOrganization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'tenant_organization_id');
    }
}
