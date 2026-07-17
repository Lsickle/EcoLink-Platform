<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\TreatmentFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd: treatments -- catálogo GLOBAL de tratamientos ambientales
// (Incineración, Coprocesamiento, Celda de Seguridad, etc.). Gestionado
// EXCLUSIVAMENTE por platform staff (ver TreatmentPolicy); la LECTURA está
// disponible para cualquier usuario autenticado con `treatments.read` --
// los Gestores lo necesitan para configurar sus `branch_treatments`.
//
// `parent_treatment_id` existe en esquema-bd (auto-referencia) pero NO se
// usa en este lote (confirmado por el usuario) -- siempre NULL.
#[Fillable([
    'tenant_organization_id', 'code', 'name', 'description', 'treatment_type',
    'requires_environmental_license', 'requires_special_transport', 'allows_recovery',
    'requires_certificate', 'requires_weight_control', 'min_temperature', 'max_temperature',
    'temperature_unit', 'risk_level', 'estimated_processing_time_hours',
    'is_system', 'is_active', 'metadata', 'created_by', 'updated_by',
])]
class Treatment extends Model
{
    /** @use HasFactory<TreatmentFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'requires_environmental_license' => 'boolean',
            'requires_special_transport' => 'boolean',
            'allows_recovery' => 'boolean',
            'requires_certificate' => 'boolean',
            'requires_weight_control' => 'boolean',
            'min_temperature' => 'decimal:2',
            'max_temperature' => 'decimal:2',
            'estimated_processing_time_hours' => 'decimal:2',
            'is_system' => 'boolean',
            'is_active' => 'boolean',
            'metadata' => 'array',
        ];
    }

    public function tenantOrganization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'tenant_organization_id');
    }

    public function branchTreatments(): HasMany
    {
        return $this->hasMany(BranchTreatment::class);
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
     * Mismo criterio que WasteStream::isAccessibleBy()/UnCode::isAccessibleBy()
     * -- catálogo global (tenant_organization_id NULL) o del propio tenant
     * del actor. En la práctica, hoy SIEMPRE es NULL (solo platform staff
     * crea tratamientos), pero se deja el mismo patrón por consistencia.
     */
    public function isAccessibleBy(User $actor): bool
    {
        return $this->tenant_organization_id === null
            || $this->tenant_organization_id === $actor->tenant_organization_id;
    }
}
