<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\HazardCharacteristicFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd: hazard_characteristics (catálogo global "Características de
// Peligrosidad", D-R04 revisado -- ver
// database/seeders/HazardCharacteristicSeeder.php). `risk_level` se ordena
// descendente en la UI (mayor = más peligroso).
#[Fillable([
    'code', 'name', 'risk_level', 'description', 'is_system', 'is_active',
])]
class HazardCharacteristic extends Model
{
    /** @use HasFactory<HazardCharacteristicFactory> */
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
