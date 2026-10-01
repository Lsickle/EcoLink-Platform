<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\SidebarModuleFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd (2026-09-28): sidebar_modules. Catálogo de los 7 grupos
// temáticos del sidebar del frontend, habilitables por organización
// individual (organization_sidebar_modules), no por tipo de organización
// (business_roles). Mismo patrón de catálogo simple que BusinessRole.
#[Fillable(['code', 'name', 'sort_order', 'is_active'])]
class SidebarModule extends Model
{
    /** @use HasFactory<SidebarModuleFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'sort_order' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    public function organizations(): BelongsToMany
    {
        return $this->belongsToMany(Organization::class, 'organization_sidebar_modules')
            ->using(OrganizationSidebarModule::class)
            ->withPivot(['enabled_by', 'enabled_at', 'is_enabled'])
            ->withTimestamps();
    }
}
