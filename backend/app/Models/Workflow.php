<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\WorkflowFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

// esquema-bd (item 17/D-WF-01): workflows -- definición de un motor de
// workflow configurable (RN-170). `tenant_organization_id` NULL =
// definición de sistema/base; un valor = personalización propia de esa
// organización.
//
// `entity_type`: por ahora solo se usa `TREATMENT` en este lote, pero el
// enum de aplicación reserva los 12 valores documentados en esquema-bd (ver
// self::ENTITY_TYPES).
// Hallazgo especialista-seguridad (requisito 4, revisión de
// WorkflowController): `current_version_id` se retira deliberadamente de
// `$fillable` -- mismo criterio que `Organization::is_platform_tenant` (ver su
// docblock). SOLO debe apuntar a una `workflow_version` PUBLISHED, y esa
// invariante solo se puede garantizar en una operación atómica dedicada
// (`WorkflowController::publishVersion()`/`WorkflowSeeder`), nunca vía
// mass-assignment de un input externo. Se asigna solo vía `forceFill()`.
#[Fillable([
    'tenant_organization_id', 'code', 'name', 'description', 'entity_type',
    'is_system', 'is_active', 'created_by', 'updated_by',
])]
class Workflow extends Model
{
    /** @use HasFactory<WorkflowFactory> */
    use HasFactory, HasUuid;

    /**
     * Enum de APLICACIÓN (no CHECK de BD, por instrucción explícita de este
     * lote) -- los 12 valores documentados en esquema-bd (D-WF-08). Solo
     * `TREATMENT` tiene datos reales sembrados hoy (WorkflowSeeder); el
     * resto queda reservado para módulos futuros.
     */
    public const ENTITY_TYPES = [
        'WASTE', 'SERVICE', 'TRANSPORT', 'MANIFEST', 'CERTIFICATE',
        'CONCILIATION', 'TREATMENT', 'ORGANIZATION', 'BRANCH', 'CONTACT',
        'SCHEDULING', 'DOCUMENT',
    ];

    protected function casts(): array
    {
        return [
            'is_system' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function tenantOrganization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'tenant_organization_id');
    }

    public function versions(): HasMany
    {
        return $this->hasMany(WorkflowVersion::class);
    }

    public function currentVersion(): BelongsTo
    {
        return $this->belongsTo(WorkflowVersion::class, 'current_version_id');
    }

    public function entityBindings(): HasMany
    {
        return $this->hasMany(WorkflowEntityBinding::class);
    }

    public function serviceBindings(): HasMany
    {
        return $this->hasMany(WorkflowServiceBinding::class);
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
     * Resuelve qué workflow gobierna un `entity_type` para una
     * organización dada -- consumido por el futuro refactor de
     * `WasteTreatmentApprovalController` (tarea siguiente, NO usado en
     * producción todavía en este lote).
     *
     * Orden de resolución:
     *   1. `workflow_service_bindings` con `scope_type='organization'` y
     *      `scope_id=$organizationId`, apuntando a un workflow ACTIVO de
     *      ese `entity_type` -- personalización explícita de la organización.
     *   2. Si no existe (o `$organizationId` es NULL), cae al workflow BASE
     *      de ese `entity_type` (`tenant_organization_id IS NULL`,
     *      `is_system=true`, `is_active=true`).
     *   3. Si tampoco existe un workflow base, devuelve NULL -- responsabilidad
     *      del llamador decidir qué hacer (p. ej. mantener el flujo hardcodeado
     *      actual como fallback, ver docblock de WasteTreatmentApprovalController).
     */
    public static function resolveFor(string $entityType, ?int $organizationId): ?self
    {
        if ($organizationId !== null) {
            $bound = static::query()
                ->where('entity_type', $entityType)
                ->where('is_active', true)
                ->whereHas('serviceBindings', function ($query) use ($organizationId) {
                    $query->where('scope_type', 'organization')->where('scope_id', $organizationId);
                })
                ->first();

            if ($bound !== null) {
                return $bound;
            }
        }

        return static::query()
            ->where('entity_type', $entityType)
            ->whereNull('tenant_organization_id')
            ->where('is_system', true)
            ->where('is_active', true)
            ->first();
    }

    /**
     * Acceso de LECTURA (`WorkflowController`, CU-021): el workflow BASE
     * (`tenant_organization_id IS NULL`) es visible para cualquier actor con
     * el permiso `workflows.manage` -- es de solo lectura para quien no sea
     * platform staff (ver `isEditableBy()`). Un workflow personalizado de
     * organización solo es visible para SU organización o platform staff.
     */
    public function isAccessibleBy(User $actor): bool
    {
        return $actor->isPlatformStaff()
            || $this->tenant_organization_id === null
            || $this->tenant_organization_id === $actor->tenant_organization_id;
    }

    /**
     * Acceso de ESCRITURA: el workflow BASE nunca es editable por un admin de
     * organización (solo por platform staff) -- un workflow personalizado
     * solo es editable por SU organización o platform staff.
     */
    public function isEditableBy(User $actor): bool
    {
        return $actor->isPlatformStaff()
            || ($this->tenant_organization_id !== null && $this->tenant_organization_id === $actor->tenant_organization_id);
    }
}
