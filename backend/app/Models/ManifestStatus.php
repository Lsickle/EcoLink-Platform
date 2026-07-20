<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\ManifestStatusFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd (manifest_statuses, D-MAN-01) -- catálogo de estados de
// `manifest_loads` (y del futuro `manifest_unloads`, Fase 5) -- ver
// docblock de la migración create_manifest_statuses_table para el detalle
// completo. Mismo patrón EXACTO que `TransportStatus`.
#[Fillable([
    'tenant_organization_id', 'code', 'name', 'description', 'sort_order',
    'is_initial', 'is_final', 'color_hex', 'icon', 'is_active', 'metadata',
])]
class ManifestStatus extends Model
{
    /** @use HasFactory<ManifestStatusFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'sort_order' => 'integer',
            'is_initial' => 'boolean',
            'is_final' => 'boolean',
            'is_active' => 'boolean',
            'metadata' => 'array',
        ];
    }

    public function tenantOrganization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'tenant_organization_id');
    }
}
