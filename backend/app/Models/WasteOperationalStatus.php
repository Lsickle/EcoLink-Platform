<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\WasteOperationalStatusFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd: waste_operational_statuses (catálogo global "Estado Operativo
// de Residuo" -- ver database/seeders/WasteOperationalStatusSeeder.php). Sin
// tenant_organization_id: solo ADMINISTRADOR gestiona el catálogo.
//
// DISTINTO de `Waste::status` (workflow de declaración BR/DEC/REV/CLS/RCH) --
// dos conceptos distintos, ya señalados como tales en esquema-bd.
#[Fillable([
    'code', 'name', 'description', 'is_system', 'is_active',
])]
class WasteOperationalStatus extends Model
{
    /** @use HasFactory<WasteOperationalStatusFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'is_system' => 'boolean',
            'is_active' => 'boolean',
        ];
    }
}
