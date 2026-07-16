<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\CountryFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

// esquema-bd (D-P01, geografía en cascada): countries. Catálogo de solo
// lectura -- sin SoftDeletes (la tabla no tiene `deleted_at`).
#[Fillable(['iso_code', 'name', 'is_active'])]
class Country extends Model
{
    /** @use HasFactory<CountryFactory> */
    use HasFactory, HasUuid;

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    public function departments(): HasMany
    {
        return $this->hasMany(Department::class);
    }
}
