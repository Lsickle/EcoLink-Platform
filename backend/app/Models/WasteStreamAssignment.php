<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\WasteStreamAssignmentFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd, punto 14: waste_stream_assignments -- pivote N:M residuo<->
// corriente Y/A. Gestionada por reemplazo completo, ver
// WasteController::syncWasteStreams()/Waste::wasteStreams().
#[Fillable([
    'tenant_organization_id', 'organization_id', 'waste_id', 'waste_stream_id',
    'is_primary', 'classification_source', 'classified_at', 'classified_by',
    'created_by', 'updated_by',
])]
class WasteStreamAssignment extends Model
{
    /** @use HasFactory<WasteStreamAssignmentFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'is_primary' => 'boolean',
            'classified_at' => 'datetime',
        ];
    }

    public function waste(): BelongsTo
    {
        return $this->belongsTo(Waste::class);
    }

    public function wasteStream(): BelongsTo
    {
        return $this->belongsTo(WasteStream::class);
    }

    public function classifiedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'classified_by');
    }
}
