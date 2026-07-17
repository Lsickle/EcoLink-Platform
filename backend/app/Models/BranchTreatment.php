<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\BranchTreatmentFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd: branch_treatments -- habilitación de un `treatment` en una
// SEDE concreta de un Gestor (organización con business_role GESTOR,
// can_treat_waste=true), con su propia capacidad/licencia. Acceso DUAL,
// mismo patrón exacto que `Branch`/`Vehicle`: platform staff gestiona
// TODOS, un admin de tenant (o usuario con `branch_treatments.read`) solo
// los de su propia organización -- ver `isAccessibleBy()`/
// `BranchTreatmentPolicy`.
//
// Deuda técnica documentada (revisión especialista-seguridad, no corregida
// en este lote): la columna `tenant_organization_id` nunca se puebla en
// store()/factory -- el eje real de aislamiento multi-tenant de esta tabla
// es `organization_id` (ver isAccessibleBy() abajo), no `tenant_organization_id`.
#[Fillable([
    'tenant_organization_id', 'organization_id', 'branch_id', 'treatment_id',
    'internal_code', 'operational_name', 'max_capacity', 'capacity_unit',
    'daily_capacity', 'monthly_capacity', 'environmental_license_number',
    'valid_from', 'valid_until', 'requires_manual_approval', 'allows_mixed_waste',
    'requires_weight_validation', 'operational_status', 'observations',
    'is_active', 'metadata', 'created_by', 'updated_by',
])]
class BranchTreatment extends Model
{
    /** @use HasFactory<BranchTreatmentFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'max_capacity' => 'decimal:2',
            'daily_capacity' => 'decimal:2',
            'monthly_capacity' => 'decimal:2',
            'valid_from' => 'date',
            'valid_until' => 'date',
            'requires_manual_approval' => 'boolean',
            'allows_mixed_waste' => 'boolean',
            'requires_weight_validation' => 'boolean',
            'is_active' => 'boolean',
            'metadata' => 'array',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function treatment(): BelongsTo
    {
        return $this->belongsTo(Treatment::class);
    }

    /**
     * esquema-bd: branch_treatment_allowed_waste_streams (D-R02, resuelve
     * RN-063) -- corrientes Y/A permitidas para este tratamiento en esta
     * sede/gestor, según su licencia ambiental. Pivote sin `updated_at`
     * (solo `created_at`/`created_by`) -- gestionado por reemplazo completo
     * (sync), no por asignación/revocación individual con historial.
     */
    public function allowedWasteStreams(): BelongsToMany
    {
        return $this->belongsToMany(
            WasteStream::class,
            'branch_treatment_allowed_waste_streams',
            'branch_treatment_id',
            'waste_stream_id',
        )->withPivot(['id', 'created_by', 'created_at']);
    }

    /**
     * esquema-bd: branch_treatment_allowed_un_codes (D-R02) -- mismo patrón
     * exacto que allowedWasteStreams(), eje Códigos UN.
     */
    public function allowedUnCodes(): BelongsToMany
    {
        return $this->belongsToMany(
            UnCode::class,
            'branch_treatment_allowed_un_codes',
            'branch_treatment_id',
            'un_code_id',
        )->withPivot(['id', 'created_by', 'created_at']);
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
     * firma que `Branch::isAccessibleBy()`/`Vehicle::isAccessibleBy()`.
     */
    public function isAccessibleBy(User $actor): bool
    {
        return $actor->isPlatformStaff() || $this->organization_id === $actor->tenant_organization_id;
    }
}
