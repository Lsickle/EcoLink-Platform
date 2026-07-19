<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\WasteTreatmentApprovalFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

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
//
// esquema-bd (item 17/D-WF-02): `technical_status`/`commercial_status` YA NO
// son columnas VARCHAR reales -- se migraron a `technical_status_id`/
// `commercial_status_id` (FK `respel_statuses`, motor de Workflow genérico,
// ver migración `add_respel_status_ids_to_waste_treatment_approvals_table`).
// Enfoque elegido (documentado en el resumen de la tarea, no silencioso):
// se CONSERVAN `technical_status`/`commercial_status` como ATRIBUTOS
// VIRTUALES (accessor + mutator, `Attribute::make()`) que traducen
// transparentemente entre el código CORTO ya esperado por todo el resto del
// código/tests (`PENDING`/`APPROVED`/... , `DRAFT`/`QUOTED`/...) y el código
// PREFIJADO real del catálogo (`TECH_*`/`COM_*`) -- minimiza el radio de
// cambio: el controller, los seeders de demo, la factory y los tests
// existentes siguen leyendo/escribiendo `$approval->technical_status` sin
// enterarse del FK subyacente. Alternativa descartada: reescribir TODOS los
// consumidores para usar `technical_status_id` + código prefijado
// directamente -- más "correcto" en el largo plazo pero mucho mayor riesgo
// de regresión en este lote, sin beneficio inmediato (el corto plazo ya
// necesita el FK para el motor de Workflow, no para exponer el prefijo).
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

    /**
     * Prefijos de `respel_statuses.code` por eje (RespelStatusSeeder) --
     * únicos consumidores de la traducción código-corto <-> código-prefijado
     * de los accessors/mutators de abajo.
     */
    private const TECHNICAL_PREFIX = 'TECH_';

    private const COMMERCIAL_PREFIX = 'COM_';

    /**
     * `technical_status`/`commercial_status` no son columnas reales -- deben
     * declararse explícitamente para aparecer en `toArray()`/`toJson()`
     * (contrato de API ya consumido por el frontend/tests: `technical_status:
     * 'APPROVED'`, no `'TECH_APPROVED'`).
     */
    protected $appends = ['technical_status', 'commercial_status'];

    /**
     * `technical_status_id`/`commercial_status_id` son NOT NULL sin default
     * de columna (a diferencia de las viejas columnas VARCHAR, que sí tenían
     * `DEFAULT 'PENDING'`/`DEFAULT 'DRAFT'`) -- varios consumidores
     * (`storeForWaste()`, `usePreapprovedMatch()`) crean filas SIN fijar
     * explícitamente el eje técnico/comercial, confiando en que "nace
     * PENDING/DRAFT" (ver docblock de la clase). Se replica ese default a
     * nivel de aplicación en `creating()`, mismo criterio que
     * `WorkflowLog::booted()` para `occurred_at`.
     */
    protected static function booted(): void
    {
        static::creating(function (self $approval) {
            $approval->technical_status_id ??= static::respelStatusIdForCode(self::TECHNICAL_PREFIX.'PENDING');
            $approval->commercial_status_id ??= static::respelStatusIdForCode(self::COMMERCIAL_PREFIX.'DRAFT');
        });
    }

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
     * Accessor/mutator del eje TÉCNICO -- ver docblock de la clase. `get`
     * traduce `TECH_APPROVED` -> `APPROVED`; `set` traduce en sentido
     * inverso y resuelve el `id` real de `respel_statuses`.
     */
    protected function technicalStatus(): Attribute
    {
        return Attribute::make(
            get: fn () => static::stripPrefix(static::respelStatusCodeForId($this->technical_status_id), self::TECHNICAL_PREFIX),
            set: fn (?string $value) => [
                'technical_status_id' => static::respelStatusIdForCode($value === null ? null : self::TECHNICAL_PREFIX.$value),
            ],
        );
    }

    /**
     * Accessor/mutator del eje COMERCIAL -- mismo criterio que
     * `technicalStatus()`.
     */
    protected function commercialStatus(): Attribute
    {
        return Attribute::make(
            get: fn () => static::stripPrefix(static::respelStatusCodeForId($this->commercial_status_id), self::COMMERCIAL_PREFIX),
            set: fn (?string $value) => [
                'commercial_status_id' => static::respelStatusIdForCode($value === null ? null : self::COMMERCIAL_PREFIX.$value),
            ],
        );
    }

    public function technicalRespelStatus(): BelongsTo
    {
        return $this->belongsTo(RespelStatus::class, 'technical_status_id');
    }

    public function commercialRespelStatus(): BelongsTo
    {
        return $this->belongsTo(RespelStatus::class, 'commercial_status_id');
    }

    /**
     * Filtra por código CORTO del eje técnico (ej. `APPROVED`), traduciendo
     * al código prefijado real de `respel_statuses` -- usado por
     * `WasteTreatmentApprovalController::index()`/`preapprovedMatches()` en
     * vez de comparar contra una columna VARCHAR que ya no existe.
     */
    public function scopeTechnicalStatusCode(Builder $query, string $shortCode): Builder
    {
        return $query->where('technical_status_id', static::respelStatusIdForCode(self::TECHNICAL_PREFIX.$shortCode));
    }

    /**
     * Mismo criterio que `scopeTechnicalStatusCode()`, para el eje comercial.
     */
    public function scopeCommercialStatusCode(Builder $query, string $shortCode): Builder
    {
        return $query->where('commercial_status_id', static::respelStatusIdForCode(self::COMMERCIAL_PREFIX.$shortCode));
    }

    /**
     * Resuelve el `id` de `respel_statuses` para un código PREFIJADO
     * (`TECH_*`/`COM_*`). Deliberadamente SIN memoización estática/`once()`:
     * en la suite de tests (RefreshDatabase por transacción + secuencias de
     * Postgres, que NO son transaccionales) un mismo proceso PHP puede ver
     * IDs distintos para el mismo `code` entre tests -- cachear por proceso
     * referenciaría el `id` sembrado por un test anterior ya revertido,
     * produciendo un FK inválido/silencioso. El catálogo es minúsculo (11
     * filas) y esta consulta nunca es un hot path -- el costo de no
     * memoizar es despreciable frente a ese riesgo. `public` porque el
     * controller también lo necesita para resolver el código PREFIJADO
     * destino (`to_status_code`) de una transición del motor de Workflow.
     */
    public static function respelStatusIdForCode(?string $code): ?int
    {
        if ($code === null) {
            return null;
        }

        return RespelStatus::query()->where('code', $code)->value('id');
    }

    /**
     * Inverso de `respelStatusIdForCode()` -- mismo criterio (sin
     * memoización, ver docblock de arriba).
     */
    public static function respelStatusCodeForId(?int $id): ?string
    {
        if ($id === null) {
            return null;
        }

        return RespelStatus::query()->where('id', $id)->value('code');
    }

    private static function stripPrefix(?string $code, string $prefix): ?string
    {
        return $code === null ? null : Str::after($code, $prefix);
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
