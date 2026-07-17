<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\WasteTreatmentApprovalFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd: waste_treatment_approvals -- "Evaluación del Gestor". Acceso
// CRUZADO controlado (patrón distinto del resto del proyecto, que solo
// conoce acceso dual platform-staff-vs-tenant): `organization_id` de ESTA
// fila es SIEMPRE el GESTOR dueño de `branch_treatment_id` -- el Generador
// dueño de `waste_id` puede pertenecer a CUALQUIER otra organización. Ambos
// lados pueden VER la fila (isAccessibleBy()), pero solo el Gestor puede
// EDITARLA/EVALUARLA (isEditableBy()) -- el dueño del residuo únicamente la
// creó al elegir el tratamiento, nunca gestiona sus términos.
//
// `technical_status`/`commercial_status` son ejes INDEPENDIENTES (ver
// WasteController::WasteTreatmentApprovalController y
// Waste::hasViableTreatment()) -- ninguno de los dos se toca vía
// store()/update(), solo vía los endpoints de transición dedicados
// (approveTechnical/rejectTechnical/approveCommercial/rejectCommercial/
// quote/negotiate/cancel), mismo criterio que `Waste::status`.
//
// Sin `created_by`/`updated_by` -- confirmado contra esquema-bd (a
// diferencia de `branch_treatments`/`wastes`, esta tabla no los define).
#[Fillable([
    'tenant_organization_id', 'organization_id', 'waste_id', 'branch_treatment_id',
    'unit_price', 'currency', 'billing_unit', 'minimum_quantity', 'maximum_quantity',
    'requires_lab_analysis', 'requires_sds', 'restrictions', 'commercial_notes',
    'technical_notes', 'valid_from', 'valid_until', 'detailed_notes',
    'is_active', 'metadata',
])]
class WasteTreatmentApproval extends Model
{
    /** @use HasFactory<WasteTreatmentApprovalFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'version' => 'integer',
            'unit_price' => 'decimal:2',
            'minimum_quantity' => 'decimal:2',
            'maximum_quantity' => 'decimal:2',
            'requires_lab_analysis' => 'boolean',
            'requires_sds' => 'boolean',
            'technical_approved_at' => 'datetime',
            'commercial_approved_at' => 'datetime',
            'valid_from' => 'date',
            'valid_until' => 'date',
            'is_active' => 'boolean',
            'metadata' => 'array',
        ];
    }

    /**
     * El GESTOR evaluador -- dueño de `branch_treatment_id`, requerido.
     */
    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    /**
     * El residuo evaluado -- puede pertenecer a CUALQUIER otra
     * organización distinta de `organization_id` (el Gestor).
     */
    public function waste(): BelongsTo
    {
        return $this->belongsTo(Waste::class);
    }

    public function branchTreatment(): BelongsTo
    {
        return $this->belongsTo(BranchTreatment::class);
    }

    public function technicalApprovedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'technical_approved_by');
    }

    public function commercialApprovedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'commercial_approved_by');
    }

    /**
     * Acceso de LECTURA -- AMBOS lados de la relación cruzada pueden ver la
     * fila: el Gestor evaluador (`organization_id`) y el dueño del residuo
     * (`waste->organization_id`), además de platform staff.
     */
    public function isAccessibleBy(User $actor): bool
    {
        return $actor->isPlatformStaff()
            || $this->organization_id === $actor->tenant_organization_id
            || $this->waste?->organization_id === $actor->tenant_organization_id;
    }

    /**
     * Acceso de ESCRITURA -- SOLO el Gestor evaluador (`organization_id`) o
     * platform staff. El dueño del residuo puede ver pero nunca editar los
     * términos de la evaluación de un Gestor ajeno.
     */
    public function isEditableBy(User $actor): bool
    {
        return $actor->isPlatformStaff() || $this->organization_id === $actor->tenant_organization_id;
    }
}
