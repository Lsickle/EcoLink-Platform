<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\OrganizationStatusFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd: organization_statuses. Sin seed en esquema-bd todavía
// (pendiente de confirmar contra la fuente de catálogos) — no se agrega
// seeder hasta tener los valores reales. Factory agregada (hallazgo
// especialista-seguridad, 2026-07-13) solo para poder probar aislamiento
// cross-tenant en tests -- no implica que el catálogo real ya esté
// definido.
#[Fillable(['code', 'name', 'description', 'sort_order', 'is_initial', 'is_final', 'allows_operation', 'is_active'])]
class OrganizationStatus extends Model
{
    /** @use HasFactory<OrganizationStatusFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'is_initial' => 'boolean',
            'is_final' => 'boolean',
            'allows_operation' => 'boolean',
            'requires_document_validation' => 'boolean',
            'requires_commercial_approval' => 'boolean',
            'is_suspended' => 'boolean',
            'is_active' => 'boolean',
            'metadata' => 'array',
        ];
    }

    public function organizations(): HasMany
    {
        return $this->hasMany(Organization::class, 'organization_status_id');
    }
}
