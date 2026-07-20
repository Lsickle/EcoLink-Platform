<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\UnloadRequestStatusFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd (unload_request_statuses) -- Fase 4 "Cita de Recepción en
// Planta". Catálogo de estados de `unload_requests`, mismo patrón EXACTO que
// `ManifestStatus`/`TransportStatus`.
#[Fillable([
    'tenant_organization_id', 'code', 'name', 'description', 'sort_order',
    'is_initial', 'is_final', 'color_hex', 'icon', 'is_active', 'metadata',
])]
class UnloadRequestStatus extends Model
{
    /** @use HasFactory<UnloadRequestStatusFactory> */
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
