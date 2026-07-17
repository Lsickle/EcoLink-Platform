<?php

namespace App\Models;

use Database\Factories\WasteHazardCharacteristicFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

// esquema-bd, punto 14 (D-R04 revisado): waste_hazard_characteristics --
// pivote N:M residuo<->característica de peligrosidad (multi-select real).
// Gestionada por reemplazo completo -- ver
// WasteController::syncHazardCharacteristics()/Waste::hazardCharacteristics().
// Auditoría mínima (solo created_at/created_by), mismo patrón exacto que
// `branch_treatment_allowed_waste_streams` (pivote de solo-sync, sin
// historial por ítem).
#[Fillable([
    'waste_id', 'hazard_characteristic_id', 'created_by',
])]
class WasteHazardCharacteristic extends Model
{
    /** @use HasFactory<WasteHazardCharacteristicFactory> */
    use HasFactory;

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
        ];
    }

    public function waste(): BelongsTo
    {
        return $this->belongsTo(Waste::class);
    }

    public function hazardCharacteristic(): BelongsTo
    {
        return $this->belongsTo(HazardCharacteristic::class);
    }
}
