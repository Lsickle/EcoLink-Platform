<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\TransportRouteFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

// Módulo Programación Logística (CU-059/CU-060): ver docblock de la
// migración create_transport_routes_table para el detalle completo.
#[Fillable([
    'organization_id', 'route_code', 'name', 'route_date', 'observations',
    'is_active', 'metadata', 'created_by', 'updated_by',
])]
class TransportRoute extends Model
{
    /** @use HasFactory<TransportRouteFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'route_date' => 'date',
            'is_active' => 'boolean',
            'metadata' => 'array',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function stops(): HasMany
    {
        return $this->hasMany(TransportRouteStop::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    /**
     * Eje de aislamiento tenant-vs-platform-staff -- mismo criterio y misma
     * firma que `TransportSchedule::isAccessibleBy()`.
     */
    public function isAccessibleBy(User $actor): bool
    {
        return $actor->isPlatformStaff() || $this->organization_id === $actor->tenant_organization_id;
    }
}
