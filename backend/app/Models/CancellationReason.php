<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\CancellationReasonFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd (D-S09): cancellation_reasons -- catálogo de motivos de
// cancelación de una `waste_service_request`, mismo patrón D-R05/D-S02
// (catálogo global + personalización por Gestor) + opción "Otra razón"
// (`is_other`).
#[Fillable(['organization_id', 'code', 'name', 'is_other', 'is_system', 'is_active'])]
class CancellationReason extends Model
{
    /** @use HasFactory<CancellationReasonFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'is_other' => 'boolean',
            'is_system' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function serviceRequests(): HasMany
    {
        return $this->hasMany(WasteServiceRequest::class, 'cancellation_reason_id');
    }
}
