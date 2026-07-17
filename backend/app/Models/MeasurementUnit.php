<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\MeasurementUnitFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd: measurement_units (catálogo global "Unidad de Medida" -- ver
// database/seeders/MeasurementUnitSeeder.php). Sin tenant_organization_id:
// solo ADMINISTRADOR gestiona el catálogo.
#[Fillable([
    'code', 'name', 'description', 'is_system', 'is_active',
])]
class MeasurementUnit extends Model
{
    /** @use HasFactory<MeasurementUnitFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'is_system' => 'boolean',
            'is_active' => 'boolean',
        ];
    }
}
