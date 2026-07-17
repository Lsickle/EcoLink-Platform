<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\WasteFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd: wastes -- núcleo del Módulo Residuos (declaración +
// clasificación). Acceso DUAL, mismo patrón exacto que
// `Branch`/`Vehicle`/`BranchTreatment`: platform staff gestiona TODOS los
// residuos, un admin de tenant (o usuario con `wastes.read`) solo los de su
// propia organización -- ver `isAccessibleBy()`/`WastePolicy`. SIN
// restricción de business_role (confirmado por el usuario).
//
// `status` (workflow de declaración BR/DEC/REV/CLS/RCH) es DISTINTO de
// `operational_status_id` (catálogo `waste_operational_statuses`) -- dos
// conceptos distintos, ver docblock de la migración.
//
// `waste_danger` es un campo DERIVADO/CACHE -- NUNCA en el Fillable (nunca
// se acepta como input directo del cliente), se recalcula exclusivamente vía
// `recalculateWasteDanger()` (forceFill), invocado tras cualquier cambio en
// `waste_hazard_characteristics` (ver WasteController::syncHazardCharacteristics()).
// `status`/`last_classification_review_at` tampoco están en el Fillable --
// se gestionan exclusivamente vía los endpoints de transición de workflow
// (submit/startReview/classify/reject), nunca vía store()/update().
#[Fillable([
    'tenant_organization_id', 'organization_id', 'branch_id', 'waste_category_id',
    'code', 'name', 'description', 'waste_type_id', 'is_template', 'is_preapproved',
    'preapproved_by_organization_id', 'requires_characterization', 'requires_sds',
    'physical_state_id', 'measurement_unit_id', 'average_weight', 'generation_frequency_id',
    'requires_special_transport', 'requires_special_ppe', 'operational_status_id',
    'quantity', 'generation_date', 'internal_reference', 'operational_notes',
    'is_active', 'metadata', 'created_by', 'updated_by',
])]
class Waste extends Model
{
    /** @use HasFactory<WasteFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'is_template' => 'boolean',
            'is_preapproved' => 'boolean',
            'requires_characterization' => 'boolean',
            'requires_sds' => 'boolean',
            'average_weight' => 'decimal:2',
            'requires_special_transport' => 'boolean',
            'requires_special_ppe' => 'boolean',
            'last_classification_review_at' => 'datetime',
            'quantity' => 'decimal:2',
            'generation_date' => 'date',
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

    public function wasteCategory(): BelongsTo
    {
        return $this->belongsTo(WasteCategory::class);
    }

    public function wasteType(): BelongsTo
    {
        return $this->belongsTo(WasteType::class);
    }

    public function physicalState(): BelongsTo
    {
        return $this->belongsTo(PhysicalState::class);
    }

    public function measurementUnit(): BelongsTo
    {
        return $this->belongsTo(MeasurementUnit::class);
    }

    public function generationFrequency(): BelongsTo
    {
        return $this->belongsTo(GenerationFrequency::class);
    }

    public function operationalStatus(): BelongsTo
    {
        return $this->belongsTo(WasteOperationalStatus::class);
    }

    public function preapprovedByOrganization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'preapproved_by_organization_id');
    }

    /**
     * esquema-bd, punto 14: waste_stream_assignments (pivote N:M residuo<->
     * corriente Y/A, CON historial) -- relación hasMany hacia el modelo
     * pivote dedicado (permite eager-load anidado `wasteStreamAssignments.wasteStream`
     * en show(), a diferencia de un belongsToMany plano).
     */
    public function wasteStreamAssignments(): HasMany
    {
        return $this->hasMany(WasteStreamAssignment::class);
    }

    /**
     * Vista N:M plana, usada por `syncWasteStreams()` para el reemplazo
     * completo -- mismo mecanismo que `BranchTreatment::allowedWasteStreams()`.
     */
    public function wasteStreams(): BelongsToMany
    {
        return $this->belongsToMany(
            WasteStream::class,
            'waste_stream_assignments',
            'waste_id',
            'waste_stream_id',
        )->withPivot(['id', 'is_primary', 'classification_source', 'classified_at', 'classified_by', 'created_by']);
    }

    /**
     * esquema-bd, punto 14: waste_un_codes (pivote N:M residuo<->código UN,
     * espejo estructural de waste_stream_assignments).
     */
    public function wasteUnCodes(): HasMany
    {
        return $this->hasMany(WasteUnCode::class);
    }

    public function unCodes(): BelongsToMany
    {
        return $this->belongsToMany(
            UnCode::class,
            'waste_un_codes',
            'waste_id',
            'un_code_id',
        )->withPivot(['id', 'is_primary', 'classification_source', 'classified_at', 'classified_by', 'valid_from', 'valid_until', 'created_by']);
    }

    /**
     * esquema-bd, punto 14 (D-R04 revisado): waste_hazard_characteristics
     * (multi-select real, resuelve `waste_danger` -- ver
     * recalculateWasteDanger()).
     */
    public function wasteHazardCharacteristics(): HasMany
    {
        return $this->hasMany(WasteHazardCharacteristic::class);
    }

    public function hazardCharacteristics(): BelongsToMany
    {
        return $this->belongsToMany(
            HazardCharacteristic::class,
            'waste_hazard_characteristics',
            'waste_id',
            'hazard_characteristic_id',
        )->withPivot(['id', 'created_by']);
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
     * esquema-bd: waste_treatment_approvals -- "Evaluación del Gestor".
     * `organization_id` de esas filas es el GESTOR evaluador, NUNCA el
     * dueño de este residuo -- ver docblock de WasteTreatmentApproval.
     */
    public function treatmentApprovals(): HasMany
    {
        return $this->hasMany(WasteTreatmentApproval::class);
    }

    /**
     * Eje de aislamiento tenant-vs-platform-staff -- mismo criterio y misma
     * firma que `Branch::isAccessibleBy()`/`Vehicle::isAccessibleBy()`.
     */
    public function isAccessibleBy(User $actor): bool
    {
        return $actor->isPlatformStaff() || $this->organization_id === $actor->tenant_organization_id;
    }

    /**
     * "Tratamiento viable" (mecanismo de preaprobación + gating de la futura
     * Solicitud de Servicio): AMBOS ejes de al menos UNA evaluación activa
     * deben estar aprobados (`technical_status=APPROVED` AND
     * `commercial_status=APPROVED`). Ambos ejes son independientes entre sí
     * (ver docblock de WasteTreatmentApproval).
     */
    public function hasViableTreatment(): bool
    {
        return $this->treatmentApprovals()
            ->where('technical_status', 'APPROVED')
            ->where('commercial_status', 'APPROVED')
            ->where('is_active', true)
            ->exists();
    }

    /**
     * Scope equivalente a hasViableTreatment(), para filtrar un listado
     * (ej. selector de residuos elegibles para Solicitud de Servicio) sin
     * una consulta N+1 por fila.
     */
    public function scopeWithViableTreatment(Builder $query): Builder
    {
        return $query->whereHas('treatmentApprovals', function (Builder $query) {
            $query->where('technical_status', 'APPROVED')
                ->where('commercial_status', 'APPROVED')
                ->where('is_active', true);
        });
    }

    /**
     * `waste_danger` (derivado/cache, esquema-bd punto 14, L-38): se
     * recalcula como la característica de MAYOR `risk_level` entre las
     * seleccionadas en `waste_hazard_characteristics` para este residuo.
     * Guarda el `code` de esa característica, o NULL si no hay ninguna
     * seleccionada. Invocado desde el modelo (no el controller) después de
     * cualquier cambio en la pivote -- ver
     * WasteController::syncHazardCharacteristics().
     */
    public function recalculateWasteDanger(): void
    {
        $topCharacteristic = $this->hazardCharacteristics()
            ->orderByDesc('risk_level')
            ->first();

        $this->forceFill(['waste_danger' => $topCharacteristic?->code])->save();
    }
}
