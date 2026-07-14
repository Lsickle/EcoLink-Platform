<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd: organization_statuses. Sin seed en esquema-bd todavía
// (pendiente de confirmar contra la fuente de catálogos) — no se agrega
// seeder hasta tener los valores reales.
class OrganizationStatus extends Model
{
    use HasUuid, SoftDeletes;

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
