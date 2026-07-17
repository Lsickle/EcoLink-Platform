<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\WasteTypeFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd: waste_types (catálogo global "Tipo de Residuo", L-41 -- ver
// database/seeders/WasteTypeSeeder.php). Sin tenant_organization_id: solo
// ADMINISTRADOR gestiona el catálogo.
#[Fillable([
    'code', 'name', 'description', 'is_system', 'is_active',
])]
class WasteType extends Model
{
    /** @use HasFactory<WasteTypeFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'is_system' => 'boolean',
            'is_active' => 'boolean',
        ];
    }
}
