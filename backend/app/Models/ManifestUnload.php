<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\ManifestUnloadFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd (manifest_unloads) + Módulo Manifiesto de Descargue, Fase 5 --
// ver docblock de la migración create_manifest_unloads_table para el detalle
// completo de las decisiones aplicadas. Gobernado por el motor de Workflow
// genérico (`entity_type=MANIFEST`, workflow PROPIO "MANIFEST_UNLOAD",
// desambiguado de "MANIFEST_LOAD" vía `entity_table` -- ver
// `Workflow::resolveFor()`/`ManifestUnloadWorkflowService`).
//
// `manifest_status_id`/`receiver_signed_at`/`driver_signed_at` se retiran
// deliberadamente del $fillable -- mismo criterio que `ManifestLoad`: solo
// deben cambiar vía `ManifestUnloadWorkflowService::transition()`/
// `ManifestUnloadSignatureService::sign()` (forceFill()).
//
// `receiving_branch_id`/`receiving_organization_id`/`vehicle_id`/
// `transport_personnel_id` SÍ están en el $fillable -- se pueblan
// server-side desde `ManifestUnloadController::store()` (derivados de la
// `unload_request_id`), nunca aceptados independientes del payload del
// cliente.
#[Fillable([
    'tenant_organization_id', 'manifest_number', 'manifest_load_id',
    'unload_request_id', 'receiving_branch_id', 'receiving_organization_id',
    'vehicle_id', 'transport_personnel_id', 'unload_date', 'unload_started_at',
    'unload_completed_at', 'received_total_weight_kg', 'rejected_total_weight_kg',
    'received_total_volume_m3', 'received_as_expected', 'receiver_person_id',
    'driver_signer_person_id', 'pdf_file_id', 'incidents', 'observations',
    'is_active', 'sync_status', 'device_captured_at', 'offline_integrity_hash',
])]
class ManifestUnload extends Model
{
    /** @use HasFactory<ManifestUnloadFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'unload_date' => 'date',
            'unload_started_at' => 'datetime',
            'unload_completed_at' => 'datetime',
            'received_total_weight_kg' => 'decimal:3',
            'rejected_total_weight_kg' => 'decimal:3',
            'received_total_volume_m3' => 'decimal:3',
            'received_as_expected' => 'boolean',
            'receiver_signed_at' => 'datetime',
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

    public function manifestLoad(): BelongsTo
    {
        return $this->belongsTo(ManifestLoad::class);
    }

    public function unloadRequest(): BelongsTo
    {
        return $this->belongsTo(UnloadRequest::class);
    }

    public function receivingBranch(): BelongsTo
    {
        return $this->belongsTo(Branch::class, 'receiving_branch_id');
    }

    public function receivingOrganization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'receiving_organization_id');
    }

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class);
    }

    public function transportPersonnel(): BelongsTo
    {
        return $this->belongsTo(TransportPersonnel::class);
    }

    public function receiverPerson(): BelongsTo
    {
        return $this->belongsTo(Person::class, 'receiver_person_id');
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
        return $this->hasMany(ManifestUnloadItem::class);
    }

    /**
     * Organización del lado transportador -- se deriva de
     * `unload_request.carrier_organization_id` (identifica a quien
     * transporta en AMBAS modalidades, ver docblock de
     * `UnloadRequestAutomationService`: incluso en autotransporte,
     * `carrier_organization_id` queda poblado con la organización dueña del
     * vehículo/conductor, que en ese caso ES el propio Generador).
     */
    public function carrierOrganizationId(): ?int
    {
        $this->loadMissing('unloadRequest');

        return $this->unloadRequest?->carrier_organization_id;
    }

    /**
     * Eje de aislamiento: acceso DUAL NO simétrico (punto 6 del enunciado de
     * esta tarea) -- la organización RECEPTORA
     * (`receiving_organization_id`) gestiona/inspecciona/genera/cancela; el
     * lado transportador (`carrierOrganizationId()`) puede leer + firmar
     * como DRIVER. Mismo criterio de acceso dual que `ManifestLoad`, con los
     * lados invertidos.
     */
    public function isAccessibleBy(User $actor): bool
    {
        return $actor->isPlatformStaff()
            || $this->receiving_organization_id === $actor->tenant_organization_id
            || ($this->carrierOrganizationId() !== null && $this->carrierOrganizationId() === $actor->tenant_organization_id);
    }
}
