<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\LocalityFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

// esquema-bd (D-P01, geografía en cascada): localities. Solo aplica a
// Bogotá D.C. en la práctica. Catálogo de solo lectura -- sin SoftDeletes
// (la tabla no tiene `deleted_at`).
#[Fillable(['municipality_id', 'code', 'name', 'is_active'])]
class Locality extends Model
{
    /** @use HasFactory<LocalityFactory> */
    use HasFactory, HasUuid;

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    public function municipality(): BelongsTo
    {
        return $this->belongsTo(Municipality::class);
    }
}
