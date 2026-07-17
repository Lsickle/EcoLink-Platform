<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\GenerationFrequencyFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd: generation_frequencies (catálogo global "Frecuencia de
// Generación" -- ver database/seeders/GenerationFrequencySeeder.php). Sin
// tenant_organization_id: solo ADMINISTRADOR gestiona el catálogo.
#[Fillable([
    'code', 'name', 'description', 'is_system', 'is_active',
])]
class GenerationFrequency extends Model
{
    /** @use HasFactory<GenerationFrequencyFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'is_system' => 'boolean',
            'is_active' => 'boolean',
        ];
    }
}
