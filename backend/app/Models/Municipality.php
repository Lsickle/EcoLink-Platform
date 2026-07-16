<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\MunicipalityFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

// esquema-bd (D-P01, geografía en cascada): municipalities. Catálogo de
// solo lectura -- sin SoftDeletes (la tabla no tiene `deleted_at`).
#[Fillable(['department_id', 'codigo_dane', 'name', 'is_active'])]
class Municipality extends Model
{
    /** @use HasFactory<MunicipalityFactory> */
    use HasFactory, HasUuid;

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function localities(): HasMany
    {
        return $this->hasMany(Locality::class);
    }
}
