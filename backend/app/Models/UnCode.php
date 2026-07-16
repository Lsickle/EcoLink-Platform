<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\UnCodeFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd: un_codes -- catálogo de Códigos ONU de transporte de
// mercancías peligrosas. Independiente de waste_streams (sin FK ni relación
// 1:1 en este lote).
#[Fillable([
    'tenant_organization_id', 'code', 'name', 'hazard_class', 'packing_group',
    'is_system', 'is_active', 'metadata', 'created_by', 'updated_by',
])]
class UnCode extends Model
{
    /** @use HasFactory<UnCodeFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'is_system' => 'boolean',
            'is_active' => 'boolean',
            'metadata' => 'array',
        ];
    }

    public function tenantOrganization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'tenant_organization_id');
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
     * Mismo criterio que WasteStream::isAccessibleBy() -- ver docblock ahí.
     */
    public function isAccessibleBy(User $actor): bool
    {
        return $this->tenant_organization_id === null
            || $this->tenant_organization_id === $actor->tenant_organization_id;
    }
}
