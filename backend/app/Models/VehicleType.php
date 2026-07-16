<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\VehicleTypeFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

// Batch 3/3 de Catálogos Maestros (último): vehicle_types (catálogo global
// "Tipos de Vehículo", 4 valores PROVISIONALES -- ver AVISO en
// database/seeders/VehicleTypeSeeder.php, sin fuente de negocio confirmada).
// Tabla de referencia AISLADA -- NO toca `vehicles.vehicle_type` (esquema-bd),
// el módulo Vehículos no está construido todavía. Sin
// tenant_organization_id/created_by/updated_by: catálogo 100% global, solo
// ADMINISTRADOR gestiona.
#[Fillable([
    'code', 'name', 'category', 'is_system', 'is_active',
])]
class VehicleType extends Model
{
    /** @use HasFactory<VehicleTypeFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'is_system' => 'boolean',
            'is_active' => 'boolean',
        ];
    }
}
