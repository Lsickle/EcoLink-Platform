<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\ManifestLoadFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd (manifest_loads) + Módulo Manifiesto de Cargue, Fase 3 -- ver
// docblock de la migración create_manifest_loads_table para el detalle
// completo de las decisiones aplicadas. Gobernado por el motor de Workflow
// genérico (`entity_type=MANIFEST`).
//
// `manifest_status_id`/`generator_signed_at`/`driver_signed_at` se retiran
// deliberadamente del $fillable -- mismo criterio que
// `TransportSchedule::transport_status_id`: solo deben cambiar vía
// `ManifestLoadWorkflowService::transition()`/`ManifestLoadSignatureService::sign()`
// (forceFill()), nunca vía mass-assignment directo de un input externo.
//
// `generator_branch_id`/`carrier_organization_id`/`vehicle_id`/
// `transport_personnel_id` SÍ están en el $fillable -- se pueblan
// server-side desde `ManifestLoadController::store()` (derivados del
// `transport_schedule_id`), nunca aceptados independientes del payload del
// cliente (ver docblock del controller).
#[Fillable([
    'tenant_organization_id', 'manifest_number', 'transport_schedule_id',
    'generator_branch_id', 'carrier_organization_id', 'vehicle_id',
    'transport_personnel_id', 'load_date', 'load_started_at',
    'load_completed_at', 'declared_total_weight_kg', 'declared_total_volume_m3',
    'generator_signer_person_id', 'driver_signer_person_id', 'pdf_file_id',
    'observations', 'is_active', 'sync_status', 'device_captured_at',
    'offline_integrity_hash',
])]
class ManifestLoad extends Model
{
    /** @use HasFactory<ManifestLoadFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'load_date' => 'date',
            'load_started_at' => 'datetime',
            'load_completed_at' => 'datetime',
            'declared_total_weight_kg' => 'decimal:3',
            'declared_total_volume_m3' => 'decimal:3',
            'generator_signed_at' => 'datetime',
            'driver_signed_at' => 'datetime',
            'device_captured_at' => 'datetime',
            'is_active' => 'boolean',
        ];
    }

    public function tenantOrganization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'tenant_organization_id');
    }

    public function manifestStatus(): BelongsTo
    {
        return $this->belongsTo(ManifestStatus::class);
    }

    public function transportSchedule(): BelongsTo
    {
        return $this->belongsTo(TransportSchedule::class);
    }

    public function generatorBranch(): BelongsTo
    {
        return $this->belongsTo(Branch::class, 'generator_branch_id');
    }

    public function carrierOrganization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'carrier_organization_id');
    }

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class);
    }

    public function transportPersonnel(): BelongsTo
    {
        return $this->belongsTo(TransportPersonnel::class);
    }

    public function generatorSignerPerson(): BelongsTo
    {
        return $this->belongsTo(Person::class, 'generator_signer_person_id');
    }

    public function driverSignerPerson(): BelongsTo
    {
        return $this->belongsTo(Person::class, 'driver_signer_person_id');
    }

    public function pdfFile(): BelongsTo
    {
        return $this->belongsTo(File::class, 'pdf_file_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(ManifestLoadItem::class);
    }

    /**
     * RN-192 ("todo manifiesto debe tener transportador asignado"): ya
     * garantizado por `carrier_organization_id`/`vehicle_id`/
     * `transport_personnel_id` NOT NULL, derivados server-side del
     * `transport_schedule_id` al crear el manifiesto -- sin guarda adicional
     * necesaria aquí, la integridad referencial de la migración lo cubre.
     *
     * Eje de aislamiento: AMBOS lados de la operación pueden VER el
     * manifiesto -- el Gestor/actor que programó el transporte
     * (`carrier_organization_id`) y el Generador dueño de la
     * `waste_service_request` subyacente (`generator_branch_id.organization_id`,
     * equivalente a `transportSchedule.wasteServiceRequest.organization_id`
     * por construcción -- ver `ManifestLoadController::store()`, que exige
     * que `source_branch_id` de la programación sea la sede de la solicitud
     * de origen). Mismo criterio de acceso dual NO simétrico que
     * `ServiceRequestPolicy` (ver su docblock): solo el actor Gestor puede
     * crear/gestionar/transicionar, el Generador tiene solo lectura + firmar.
     */
    public function isAccessibleBy(User $actor): bool
    {
        return $actor->isPlatformStaff()
            || $this->carrier_organization_id === $actor->tenant_organization_id
            || $this->generatorOrganizationId() === $actor->tenant_organization_id;
    }

    /**
     * Organización Generadora dueña de la sede de cargue -- se deriva de
     * `generator_branch_id.organization_id` (columna directa, sin necesidad
     * de atravesar `transport_schedule.waste_service_request`).
     */
    public function generatorOrganizationId(): ?int
    {
        $this->loadMissing('generatorBranch');

        return $this->generatorBranch?->organization_id;
    }
}
