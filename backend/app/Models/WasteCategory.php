<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\WasteCategoryFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd: waste_categories (catálogo global "Categoría de Residuo",
// D-R05 -- ver database/seeders/WasteCategorySeeder.php). Sin
// tenant_organization_id/organization_id: solo ADMINISTRADOR gestiona el
// catálogo; la activación por organización queda para el módulo Residuos.
#[Fillable([
    'code', 'name', 'description', 'is_system', 'is_active',
])]
class WasteCategory extends Model
{
    /** @use HasFactory<WasteCategoryFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'is_system' => 'boolean',
            'is_active' => 'boolean',
        ];
    }
}
