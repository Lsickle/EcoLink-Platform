<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\OrganizationalAreaFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd: organizational_areas (no documentada en el DDL de esquema-bd
// -- gap explícito, ver comentario en la migración). Entidad jerárquica
// scoped por organización, mismo patrón auto-referencial exacto que
// Organization::parent()/children().
#[Fillable([
    'organization_id', 'code', 'name', 'parent_area_id', 'level',
    'responsible_person_id', 'is_active',
])]
class OrganizationalArea extends Model
{
    /** @use HasFactory<OrganizationalAreaFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(OrganizationalArea::class, 'parent_area_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(OrganizationalArea::class, 'parent_area_id');
    }

    public function responsiblePerson(): BelongsTo
    {
        return $this->belongsTo(Person::class, 'responsible_person_id');
    }

    /**
     * Aislamiento cross-tenant (mismo criterio que WasteStream::
     * isAccessibleBy()/UnCode::isAccessibleBy()/Role::isAccessibleBy()):
     * `organizational_areas.organization_id` (NOT NULL, sin equivalente
     * global) se compara contra `tenant_organization_id` del actor -- la
     * columna de aislamiento de seguridad multi-tenant ya usada por
     * `User::isSameTenantAs()` en todo el proyecto (ver aviso en
     * `Organization::hasCapability()` sobre la distinción `organization_id`
     * operativo vs. `tenant_organization_id` de aislamiento). `isPlatformStaff()`
     * exime del chequeo -- mismo criterio que `PermissionController::show()`/
     * `roles()`/`users()`.
     */
    public function isAccessibleBy(User $actor): bool
    {
        return $actor->isPlatformStaff() || $this->organization_id === $actor->tenant_organization_id;
    }
}
