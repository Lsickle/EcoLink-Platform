<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\OrganizationFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;
use InvalidArgumentException;

// esquema-bd: organizations.
// Hallazgo Bajo (especialista-seguridad, 2026-07-14): `is_platform_tenant`
// se retira deliberadamente de $fillable -- D-CER-04 exige exactamente una
// fila TRUE en todo el sistema, y ningún mass-assignment futuro (p. ej. un
// Organization::create($request->validated()) en un controller de
// Organizaciones todavía no escrito) debe poder tocarlo por accidente. Se
// asigna solo vía forceFill()/asignación directa de propiedad (ver
// PlatformOrganizationSeeder), nunca vía $fillable. Reforzado además por un
// índice único parcial de Postgres a nivel de esquema (ver migración
// add_unique_single_platform_tenant_index_to_organizations_table).
// `created_by`/`updated_by` van en el Fillable a propósito -- mismo criterio
// que `Role`/`User`: siempre se fijan server-side desde
// `$request->user()->id` en OrganizationController, nunca como input del
// cliente.
#[Fillable([
    'legal_name', 'trade_name', 'tax_id', 'tax_id_type', 'email', 'phone', 'website',
    'organization_status_id', 'registration_date', 'observations',
    'economic_activity_code', 'economic_activity_name', 'environmental_authority',
    'environmental_registration', 'billing_email', 'support_email', 'timezone',
    'country_code', 'currency_code', 'company_size', 'employee_count', 'customer_since',
    'risk_level', 'parent_organization_id', 'contract_expiration_date', 'storage_quota_gb',
    'is_active', 'custom_fields_enabled', 'created_by', 'updated_by',
])]
class Organization extends Model
{
    /** @use HasFactory<OrganizationFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected static function booted(): void
    {
        // organizations es la única tabla con un segundo UUID propio
        // (traceability_uuid, además de uuid) -- ver HasUuid para el porqué
        // de generarlo en PHP en vez de confiar en el DEFAULT de Postgres.
        static::creating(function (self $organization) {
            $organization->traceability_uuid ??= (string) Str::uuid();
        });
    }

    protected function casts(): array
    {
        return [
            'registration_date' => 'date',
            'is_active' => 'boolean',
            // D-CER-04: exactamente una fila TRUE (EcoLink) en todo el sistema.
            'is_platform_tenant' => 'boolean',
            'custom_fields_enabled' => 'boolean',
            'metadata_json' => 'array',
            'storage_quota_gb' => 'decimal:2',
            'storage_used_gb' => 'decimal:2',
            'last_activity_at' => 'datetime',
            'contract_expiration_date' => 'date',
            'customer_since' => 'date',
        ];
    }

    public function status(): BelongsTo
    {
        return $this->belongsTo(OrganizationStatus::class, 'organization_status_id');
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'parent_organization_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(Organization::class, 'parent_organization_id');
    }

    /**
     * esquema-bd: organization_contacts (D-P02 / L-08) -- pivote N:N real
     * Contacto<->Organización, reemplaza el `people(): HasMany` viejo
     * (basado en `people.organization_id`, 1:1). Una misma persona puede
     * ser contacto de VARIAS organizaciones a la vez, cada vínculo con su
     * propio cargo (`position_title`, texto libre -- ver AVISO en la
     * migración `create_organization_contacts_table` sobre por qué no es un
     * FK a un catálogo `positions`) y, opcionalmente, acotado a una sede
     * concreta de esa organización (`branch_id`).
     */
    public function contacts(): BelongsToMany
    {
        return $this->belongsToMany(Person::class, 'organization_contacts', 'organization_id', 'contact_id')
            ->using(OrganizationContact::class)
            ->withPivot(['id', 'branch_id', 'position_title', 'relationship_type', 'is_primary', 'start_date', 'is_active'])
            ->withTimestamps();
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function branches(): HasMany
    {
        return $this->hasMany(Branch::class);
    }

    /**
     * esquema-bd: organizations.created_by/updated_by (auditoría estándar)
     * -- mismo patrón que Role::createdBy()/updatedBy(), usadas por
     * OrganizationController::show() para resolver quién creó/modificó la
     * organización a `{id, username}`.
     */
    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    /**
     * "Ciudad Principal" (Figma, columna+filtro de `index()` y card de
     * info de `show()`) -- convención PRÁCTICA de este lote, NO una regla
     * de negocio confirmada: `organizations` no tiene columnas de
     * ubicación propias (esquema-bd), así que se deriva de la sede activa
     * de MENOR id de la organización. `hasOne::ofMany()` (en vez de
     * `branches()->where(...)->oldest()->first()` por organización) para
     * poder eager-cargarla en `index()` sin una query por fila (N+1).
     */
    public function primaryBranch(): HasOne
    {
        return $this->hasOne(Branch::class)
            ->ofMany(
                ['id' => 'min'],
                fn (Builder $query) => $query->where('is_active', true),
            );
    }

    /**
     * Eje 2 de autorización: los business_roles de una organización (tipo de
     * organización -- GENERATOR/GESTOR/SUBGESTOR/TRANSPORTER/
     * COMERCIALIZADOR), independiente del RBAC del usuario individual.
     */
    public function businessRoles(): BelongsToMany
    {
        return $this->belongsToMany(BusinessRole::class, 'organization_business_roles')
            ->using(OrganizationBusinessRole::class)
            ->withPivot(['assigned_by', 'assigned_at', 'is_active'])
            ->withTimestamps();
    }

    private const CAPABILITY_FLAGS = [
        'can_generate_waste', 'can_transport_waste', 'can_treat_waste',
        'can_approve_treatments', 'can_issue_manifests',
        'can_issue_disposal_certificates', 'requires_environmental_license',
        'requires_transport_authorization',
    ];

    /**
     * El chequeo se hace sobre la organización OPERATIVA (`$this`, vía la FK
     * `organization_id` que tendría un `User`), no sobre
     * `tenant_organization_id` -- esa es la columna de aislamiento de
     * seguridad multi-tenant (ya usada por `User::isSameTenantAs()`),
     * semánticamente distinta de "qué puede hacer esta organización según su
     * tipo de negocio" (RN aplicable a la organización dueña del recurso,
     * no al grupo de aislamiento del actor).
     *
     * AVISO (mismo criterio que `Role::isAccessibleBy()`, especialista-
     * seguridad 2026-07-14): este método NO valida aislamiento multi-tenant
     * ni jerarquía de organizaciones (matriz→hija, RN-188) -- solo responde
     * si ESTA organización, en abstracto, tiene la capacidad de negocio
     * pedida. Es responsabilidad del llamador (futuro Controller/Policy)
     * garantizar que el actor tiene visibilidad legítima sobre `$this` antes
     * de invocarlo.
     */
    /**
     * Scope de consulta equivalente a hasCapability(), para filtrar un
     * listado (ej. selector de organizaciones Gestor en el formulario de
     * Tratamiento de Sucursal) en vez de evaluar una instancia ya cargada.
     */
    public function scopeWithCapability(Builder $query, string $flag): Builder
    {
        if (! in_array($flag, self::CAPABILITY_FLAGS, true)) {
            throw new InvalidArgumentException("Flag de capacidad desconocido: {$flag}");
        }

        return $query->whereHas('businessRoles', function ($query) use ($flag) {
            $query->where('organization_business_roles.is_active', true)
                ->where('business_roles.is_active', true)
                ->where($flag, true);
        });
    }

    public function hasCapability(string $flag): bool
    {
        if (! in_array($flag, self::CAPABILITY_FLAGS, true)) {
            throw new InvalidArgumentException("Flag de capacidad desconocido: {$flag}");
        }

        return $this->businessRoles()
            ->wherePivot('is_active', true)
            ->where('business_roles.is_active', true)
            ->where($flag, true)
            ->exists();
    }
}
