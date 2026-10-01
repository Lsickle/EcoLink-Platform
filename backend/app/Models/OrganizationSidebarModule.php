<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Relations\Concerns\AsPivot;
use Illuminate\Database\Eloquent\Relations\Pivot;

// esquema-bd (2026-09-28): organization_sidebar_modules. UNIQUE(organization_id,
// sidebar_module_id).
//
// Sin SoftDeletes -- mismo AVISO que OrganizationBusinessRole:
// BelongsToMany::wherePivot()/withPivot() de Laravel no aplica
// automáticamente el global scope de SoftDeletes de un pivote personalizado.
// El único mecanismo de revocación soportado es `is_enabled=false`.
class OrganizationSidebarModule extends Pivot
{
    use AsPivot, HasUuid;

    protected $table = 'organization_sidebar_modules';

    public $incrementing = true;

    protected function casts(): array
    {
        return [
            'enabled_at' => 'datetime',
            'is_enabled' => 'boolean',
        ];
    }
}
