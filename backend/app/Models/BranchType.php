<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\BranchTypeFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd: branch_types (catálogo nuevo, flags de capacidad para el
// futuro módulo Organizaciones/Sedes -- ver
// database/seeders/BranchTypeSeeder.php).
#[Fillable([
    'code', 'name', 'category',
    'is_logistics', 'is_storage', 'is_treatment', 'is_dispatch',
    'sort_order', 'is_active',
])]
class BranchType extends Model
{
    /** @use HasFactory<BranchTypeFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'is_logistics' => 'boolean',
            'is_storage' => 'boolean',
            'is_treatment' => 'boolean',
            'is_dispatch' => 'boolean',
            'is_active' => 'boolean',
        ];
    }
}
