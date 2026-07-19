<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\TransportPersonnelFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd (hallazgo #7, "Conductor como extensión 1:1 de people"):
// transport_personnel -- ver docblock de la migración
// create_transport_personnel_table para el detalle completo de las
// decisiones aplicadas.
#[Fillable([
    'organization_id', 'person_id', 'license_number', 'license_category',
    'license_expiration_date', 'has_hazmat_permit', 'is_active', 'metadata',
    'created_by', 'updated_by',
])]
class TransportPersonnel extends Model
{
    /** @use HasFactory<TransportPersonnelFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    // Eloquent pluraliza "personnel" -> "personnels" (no reconoce que ya es
    // invariable en inglés) -- se fija el nombre de tabla explícito para
    // que coincida con `esquema-bd` (`transport_personnel`, singular/plural
    // idéntico).
    protected $table = 'transport_personnel';

    protected function casts(): array
    {
        return [
            'license_expiration_date' => 'date',
            'has_hazmat_permit' => 'boolean',
            'is_active' => 'boolean',
            'metadata' => 'array',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function person(): BelongsTo
    {
        return $this->belongsTo(Person::class);
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
     * firma que `Vehicle::isAccessibleBy()`.
     */
    public function isAccessibleBy(User $actor): bool
    {
        return $actor->isPlatformStaff() || $this->organization_id === $actor->tenant_organization_id;
    }
}
