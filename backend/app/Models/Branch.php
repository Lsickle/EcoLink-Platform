<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\BranchFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd: branches (Sede). El DDL de esquema-bd documenta una FK
// `location_id -> locations` que no se replica aquí -- `locations` nunca
// existió (D-P01, reemplazada por `addresses` polimórfica); en su lugar se
// usan FKs geográficas directas y opcionales (country/department/
// municipality/locality), decisión confirmada en el plan de este lote.
//
// `environmental_license`/`license_expiration_date` es un solo campo
// genérico, no separado por tipo de licencia: la etiqueta se relabela en
// el frontend según el business_role de la organización dueña (Reg. RESPEL
// si Generador, Lic. Transporte si Transportador) -- no hay necesidad de
// columnas separadas por tipo.
// `created_by`/`updated_by` en el Fillable a propósito -- mismo criterio que
// `Organization`/`Role`: siempre se fijan server-side desde
// `$request->user()->id` en BranchController, nunca como input del cliente.
#[Fillable([
    'organization_id', 'branch_type_id', 'code', 'name', 'status',
    'country_id', 'department_id', 'municipality_id', 'locality_id',
    'address', 'phone', 'email', 'environmental_license',
    'license_expiration_date', 'operational_capacity', 'observations',
    'is_active', 'created_by', 'updated_by',
])]
class Branch extends Model
{
    /** @use HasFactory<BranchFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'license_expiration_date' => 'date',
            'operational_capacity' => 'decimal:2',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function branchType(): BelongsTo
    {
        return $this->belongsTo(BranchType::class);
    }

    public function country(): BelongsTo
    {
        return $this->belongsTo(Country::class);
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function municipality(): BelongsTo
    {
        return $this->belongsTo(Municipality::class);
    }

    public function locality(): BelongsTo
    {
        return $this->belongsTo(Locality::class);
    }

    /**
     * esquema-bd: users.branch_id -- usuarios asignados operativamente a
     * esta sede (tab "Usuarios" de Branch, BranchController::users()).
     */
    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    /**
     * esquema-bd: branches.created_by/updated_by (auditoría estándar) --
     * mismo patrón que Organization::createdBy()/updatedBy().
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
     * esquema-bd: organization_contacts (D-P02 / L-08) -- contactos
     * acotados a ESTA sede concreta (`branch_id`), solo los vínculos
     * activos (`is_active=true`, mismo criterio de revocación que
     * `OrganizationBusinessRole`/`role_permissions`).
     */
    public function contacts(): BelongsToMany
    {
        return $this->belongsToMany(Person::class, 'organization_contacts', 'branch_id', 'contact_id')
            ->using(OrganizationContact::class)
            ->withPivot(['id', 'organization_id', 'position_title', 'relationship_type', 'is_primary', 'start_date', 'is_active'])
            ->wherePivot('is_active', true);
    }

    /**
     * Eje de aislamiento tenant-vs-platform-staff (mismo criterio y misma
     * firma que `Role::isAccessibleBy()`/`Organization::hasCapability()`
     * doc): una sede SIEMPRE pertenece a una organización concreta, sin el
     * caso "NULL = global" que sí aplica a `Role`/`Permission`.
     */
    public function isAccessibleBy(User $actor): bool
    {
        return $actor->isPlatformStaff() || $this->organization_id === $actor->tenant_organization_id;
    }
}
