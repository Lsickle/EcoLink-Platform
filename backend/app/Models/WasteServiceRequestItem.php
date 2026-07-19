<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\WasteServiceRequestItemFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd (Módulo Solicitudes de Servicio, detalle):
// waste_service_request_items -- detalle de residuos de una
// `waste_service_request`. `waste_treatment_approval_id` (D-S01) fija, POR
// ÍTEM, cuál evaluación/Gestor aplica -- ver docblock de la migración
// create_waste_service_request_items_table para el detalle completo de las
// decisiones aplicadas (D-S01/D-S06/D-S10/D-S11).
#[Fillable([
    'tenant_organization_id', 'service_request_id', 'item_sequence', 'waste_id',
    'waste_treatment_approval_id', 'waste_name_snapshot', 'waste_code_snapshot',
    'treatment_snapshot', 'estimated_quantity', 'actual_quantity', 'estimated_weight',
    'actual_weight', 'measurement_unit_id', 'packaging_type', 'physical_state_id',
    'is_stackable', 'requires_forklift', 'requires_isolation', 'height', 'width',
    'length', 'calculated_volume', 'item_status_id', 'observations', 'is_active', 'metadata',
])]
class WasteServiceRequestItem extends Model
{
    /** @use HasFactory<WasteServiceRequestItemFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'item_sequence' => 'integer',
            'estimated_quantity' => 'decimal:2',
            'actual_quantity' => 'decimal:2',
            'estimated_weight' => 'decimal:2',
            'actual_weight' => 'decimal:2',
            'is_stackable' => 'boolean',
            'requires_forklift' => 'boolean',
            'requires_isolation' => 'boolean',
            'height' => 'decimal:2',
            'width' => 'decimal:2',
            'length' => 'decimal:2',
            'calculated_volume' => 'decimal:3',
            'is_active' => 'boolean',
            'metadata' => 'array',
        ];
    }

    public function serviceRequest(): BelongsTo
    {
        return $this->belongsTo(WasteServiceRequest::class, 'service_request_id');
    }

    public function waste(): BelongsTo
    {
        return $this->belongsTo(Waste::class);
    }

    /**
     * D-S01: fija el Gestor/tratamiento aplicable a ESTE ítem -- puede
     * diferir entre ítems de la misma solicitud (D-S01) y el tratamiento
     * finalmente aplicado podría diferir del solicitado (D-S06, resolución
     * diferida a un futuro módulo de Tratamientos/Certificados).
     */
    public function wasteTreatmentApproval(): BelongsTo
    {
        return $this->belongsTo(WasteTreatmentApproval::class);
    }

    public function measurementUnit(): BelongsTo
    {
        return $this->belongsTo(MeasurementUnit::class);
    }

    public function physicalState(): BelongsTo
    {
        return $this->belongsTo(PhysicalState::class);
    }

    /**
     * D-S10: catálogo SEPARADO de la cabecera -- viabilidad de recolección
     * de este ítem específico.
     */
    public function itemStatus(): BelongsTo
    {
        return $this->belongsTo(ServiceItemStatus::class, 'item_status_id');
    }

    /**
     * D-S25 (Fase 1b): SOLO el Gestor dueño del `waste_treatment_approval`
     * de ESTE ítem (o platform staff) puede evaluarlo -- nunca otro Gestor
     * de la misma solicitud. Un ítem sin `waste_treatment_approval_id`
     * asignado (todavía en Borrador) no tiene Gestor dueño -- no es
     * evaluable por nadie salvo platform staff.
     */
    public function isEvaluableBy(User $actor): bool
    {
        return $actor->isPlatformStaff() || $this->wasteTreatmentApproval?->organization_id === $actor->tenant_organization_id;
    }
}
