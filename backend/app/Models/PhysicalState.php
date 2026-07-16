<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\PhysicalStateFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd, item 14(b) (L-41): physical_states (catálogo global "Estado
// Físico", compartido entre waste_streams/wastes -- ver
// database/seeders/PhysicalStateSeeder.php).
#[Fillable([
    'code', 'name', 'is_system', 'is_active',
])]
class PhysicalState extends Model
{
    /** @use HasFactory<PhysicalStateFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'is_system' => 'boolean',
            'is_active' => 'boolean',
        ];
    }
}
