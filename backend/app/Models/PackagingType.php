<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\PackagingTypeFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

// Batch 3/3 de Catálogos Maestros (último): packaging_types (catálogo global
// "Tipos de Embalaje", 29 valores reales -- ver
// database/seeders/PackagingTypeSeeder.php). Sin
// tenant_organization_id/created_by/updated_by: catálogo 100% global, solo
// ADMINISTRADOR gestiona.
#[Fillable([
    'code', 'name', 'is_system', 'is_active',
])]
class PackagingType extends Model
{
    /** @use HasFactory<PackagingTypeFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'is_system' => 'boolean',
            'is_active' => 'boolean',
        ];
    }
}
