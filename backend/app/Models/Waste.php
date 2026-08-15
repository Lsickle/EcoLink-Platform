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
// `status` (ciclo de vida BR/DEC/REV/CLS/APR/SUS -- ver constantes) es
// DISTINTO de
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

    /*
     * Ciclo de vida del residuo (modelo confirmado por el usuario, 2026-08-14).
     *
     *   BR --submit--> DEC --toma--> REV --aprob. técnica--> CLS --aprob. final--> APR
     *                   ^                                                          |
     *                   +---- rechazo técnico (con observación) ----+      EcoLink |
     *                                                                      APR <-> SUS
     *
     * `REV -> CLS` y `CLS -> APR` son AUTOMÁTICAS: las dispara la resolución de
     * la evaluación (`WasteTreatmentApprovalController`), no un botón aparte
     * que se pueda olvidar. El estado del residuo lo gobierna el GESTOR que
     * evalúa, no su dueño.
     *
     * `APR` es lo ÚNICO que habilita una Solicitud de Servicio.
     *
     * `RCH` (Rechazado) se retiró: figuraba en etiquetas y filtros pero ninguna
     * transición lo producía -- rechazar devolvía (y devuelve) a un estado
     * anterior, nunca a RCH.
     */
    public const STATUS_DRAFT = 'BR';

    public const STATUS_DECLARED = 'DEC';

    public const STATUS_IN_REVIEW = 'REV';

    public const STATUS_CLASSIFIED = 'CLS';

    public const STATUS_APPROVED = 'APR';

    public const STATUS_SUSPENDED = 'SUS';

    /** Estados en los que el residuo NO es visible para una contraparte vinculada. */
    public const STATUSES_HIDDEN_CROSS_TENANT = [self::STATUS_DRAFT];

    /**
     * Estados que impiden pedir una evaluación nueva. Al borrador invisible se
     * suma `SUS`: un residuo retirado de circulación no debe volver a
     * ofrecerse a un Gestor. Un `APR` sí puede reenviarse -- una evaluación
     * adicional no lo hace retroceder (lo garantiza `syncWasteStatus()`).
     */
    public const STATUSES_NOT_FORWARDABLE = [self::STATUS_DRAFT, self::STATUS_SUSPENDED];

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
     * Cadena Generador -> Subgestor -> Gestor (confirmado por stakeholders
     * reales, 2026-08-09; NO reemplaza `isAccessibleBy()`, es una vía
     * ADICIONAL de solo VER + solicitar evaluación, nunca de editar/
     * clasificar/rechazar -- ver `WastePolicy::view()`/`requestEvaluation()`).
     * `true` si existe una relación `generator_subgestor_relationships`
     * ACTIVA donde este residuo pertenece al Generador y el actor pertenece
     * al Subgestor autorizado, Y el residuo ya salió de Borrador (`status !=
     * 'BR'`, corrección confirmada por el usuario 2026-08-12 tras la pasada
     * de `especialista-seguridad`: la visibilidad cruzada arranca en
     * "Declarado", no mientras el Generador todavía lo está armando).
     */
    public function isForwardableBySubgestor(User $actor): bool
    {
        return ! in_array($this->status, self::STATUSES_NOT_FORWARDABLE, true)
            && GeneratorSubgestorRelationship::query()
            ->where('generator_organization_id', $this->organization_id)
            ->where('subgestor_organization_id', $actor->tenant_organization_id)
            ->where('is_active', true)
            ->exists();
    }

    /**
     * Corrección del modelo de negocio confirmada por el usuario, 2026-08-12:
     * un residuo YA DECLARADO (`status != 'BR'`, ver docblock de
     * `isForwardableBySubgestor()`) debe ser visible automáticamente para
     * CUALQUIER Gestor con relación comercial ACTIVA hacia el Generador dueño
     * -- sin que nadie tenga que "solicitar evaluación" primero. Mismo patrón
     * exacto que `isForwardableBySubgestor()` de arriba, pero consultando
     * `generator_gestor_relationships` -- y, a diferencia del Subgestor (que
     * solo puede REENVIAR el residuo a un Gestor ajeno), el Gestor con esta
     * relación puede además OFRECER su propio tratamiento directamente (ver
     * `WasteTreatmentApprovalController::storeForWaste()`), porque él mismo
     * es quien evaluaría/trataría el residuo -- no un intermediario.
     */
    public function isForwardableByGestor(User $actor): bool
    {
        return ! in_array($this->status, self::STATUSES_NOT_FORWARDABLE, true)
            && GeneratorGestorRelationship::query()
            ->where('generator_organization_id', $this->organization_id)
            ->where('gestor_organization_id', $actor->tenant_organization_id)
            ->where('is_active', true)
            ->exists();
    }

    /**
     * "Tratamiento viable": existe AL MENOS UNA evaluación activa con el eje
     * TÉCNICO aprobado.
     *
     * El eje COMERCIAL dejó de exigirse (confirmado por el usuario,
     * 2026-08-14): los stakeholders priorizan la viabilización técnica, y el
     * proceso comercial -- precio, condiciones -- ocurre FUERA de la
     * plataforma y ANTES de declarar el residuo. Exigirlo aquí bloqueaba el
     * flujo por información que se completa después, cuando llegue.
     *
     * OJO: esto NO es lo que habilita una Solicitud de Servicio -- eso lo
     * decide `status === STATUS_APPROVED`, que además exige la aprobación
     * final. Este helper solo responde "¿algún Gestor ya le asignó un
     * tratamiento?".
     */
    public function hasViableTreatment(): bool
    {
        return $this->treatmentApprovals()
            ->technicalStatusCode('APPROVED')
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
            $query->technicalStatusCode('APPROVED')
                ->where('is_active', true);
        });
    }

    /**
     * Inverso exacto de `scopeWithViableTreatment()` -- "pendiente de
     * evaluación" (corrección del modelo de negocio, 2026-08-12): un residuo
     * SIN ninguna evaluación con ambos ejes aprobados. Combinado con la
     * visibilidad cross-tenant ya existente (`WasteController::
     * applyOrganizationVisibility()`), es la consulta que alimenta la
     * "bandeja compartida" de un Gestor/Subgestor vinculado -- no requiere
     * columna ni migración nueva, siempre queda sincronizado porque se
     * calcula en cada consulta.
     */
    public function scopeWithoutViableTreatment(Builder $query): Builder
    {
        return $query->whereDoesntHave('treatmentApprovals', function (Builder $query) {
            $query->technicalStatusCode('APPROVED')
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

    /**
     * Resuelve el `code` cacheado en `waste_danger` a la fila completa de
     * `hazard_characteristics` (para que la UI pueda mostrar `name`, no el
     * código corto -- pedido explícito del usuario, la peligrosidad debe
     * leerse siempre con la palabra completa). `code` es UNIQUE en el
     * catálogo (ver HazardCharacteristicSeeder), por eso alcanza con un
     * `belongsTo` simple sin pasar por la pivote `waste_hazard_characteristics`.
     */
    public function wasteDangerCharacteristic(): BelongsTo
    {
        return $this->belongsTo(HazardCharacteristic::class, 'waste_danger', 'code');
    }
}
