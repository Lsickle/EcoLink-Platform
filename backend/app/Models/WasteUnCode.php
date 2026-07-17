<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\WasteUnCodeFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd, punto 14: waste_un_codes -- pivote N:M residuo<->código UN,
// espejo estructural de `waste_stream_assignments`. Ver
// WasteController::syncUnCodes()/Waste::unCodes().
#[Fillable([
    'waste_id', 'un_code_id', 'is_primary', 'classification_source',
    'classified_at', 'classified_by', 'valid_from', 'valid_until',
    'created_by', 'updated_by',
])]
class WasteUnCode extends Model
{
    /** @use HasFactory<WasteUnCodeFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'is_primary' => 'boolean',
            'classified_at' => 'datetime',
            'valid_from' => 'date',
            'valid_until' => 'date',
        ];
    }

    public function waste(): BelongsTo
    {
        return $this->belongsTo(Waste::class);
    }

    public function unCode(): BelongsTo
    {
        return $this->belongsTo(UnCode::class);
    }

    public function classifiedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'classified_by');
    }
}
