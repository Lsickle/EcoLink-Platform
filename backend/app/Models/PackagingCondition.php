<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\PackagingConditionFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

// Batch 3/3 de Catálogos Maestros (último): packaging_conditions (catálogo
// global "Estados del Embalaje", 3 valores PROVISIONALES -- ver AVISO en
// database/seeders/PackagingConditionSeeder.php, sin fuente de negocio
// confirmada). Sin tenant_organization_id/created_by/updated_by: catálogo
// 100% global, solo ADMINISTRADOR gestiona. `risk_level` se ordena
// descendente en la UI (mayor = más peligroso), mismo criterio que
// hazard_characteristics.
#[Fillable([
    'code', 'name', 'risk_level', 'is_system', 'is_active',
])]
class PackagingCondition extends Model
{
    /** @use HasFactory<PackagingConditionFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'risk_level' => 'integer',
            'is_system' => 'boolean',
            'is_active' => 'boolean',
        ];
    }
}
