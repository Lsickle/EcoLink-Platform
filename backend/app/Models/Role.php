<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\RoleFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\DB;

// esquema-bd: roles.
// `created_by`/`updated_by` van en el Fillable a propósito -- mismo criterio
// que `tenant_organization_id`: siempre se fijan server-side desde
// `$request->user()->id` en RoleController, nunca como input del cliente.
#[Fillable(['tenant_organization_id', 'code', 'name', 'description', 'is_system', 'is_editable', 'priority_level', 'is_active', 'created_by', 'updated_by'])]
class Role extends Model
{
    /** @use HasFactory<RoleFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'is_system' => 'boolean',
            'is_editable' => 'boolean',
            'is_active' => 'boolean',
            'metadata' => 'array',
        ];
    }

    public function tenantOrganization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'tenant_organization_id');
    }

    /**
     * esquema-bd: roles.created_by/updated_by (auditoría estándar) -- usadas
     * por RoleController::show() (Figma "Detalle de Rol") para resolver el
     * nombre de quien creó/modificó el rol, mismo estilo que
     * `tenantOrganization()`.
     */
    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function permissions(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class, 'role_permissions')
            ->using(RolePermission::class)
            ->withPivot(['assigned_by', 'assigned_at', 'expires_at', 'is_active'])
            ->withTimestamps();
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'user_roles')
            ->using(UserRole::class)
            ->withPivot(['assigned_by', 'assigned_at', 'expires_at', 'is_active'])
            ->withTimestamps();
    }

    /**
     * Aislamiento cross-tenant para roles (hallazgo Crítico, especialista-
     * seguridad 2026-07-13, segunda pasada) -- semántica DISTINTA a
     * `User::isSameTenantAs()`: aquí `tenant_organization_id = NULL`
     * significa "rol global de sistema" (p. ej. ADMINISTRADOR), visible y
     * asignable por CUALQUIER actor, no "mismo grupo que un actor sin
     * tenant". Un rol propio de una organización (`tenant_organization_id`
     * no nulo) solo es accesible por actores de ESE mismo tenant exacto.
     */
    public function isAccessibleBy(User $actor): bool
    {
        return $this->tenant_organization_id === null
            || $this->tenant_organization_id === $actor->tenant_organization_id;
    }

    /**
     * Hallazgo Alto (especialista-seguridad, 2026-07-14): guarda análoga a
     * `User::tenantHasOtherActiveUserWithPermission()`, usada por
     * `RoleController::deactivate()` antes de persistir -- pero la
     * exclusión es por ROL (`$this->id`, el rol a punto de desactivarse),
     * no por usuario. Pregunta: excluyendo ESTE rol, ¿sigue existiendo al
     * menos un usuario activo del tenant de este rol con el permiso dado
     * por otra vía? Los roles GLOBALES (`tenant_organization_id IS NULL`,
     * p. ej. ADMINISTRADOR) siempre cuentan como cobertura válida --
     * mismo criterio de accesibilidad que `isAccessibleBy()`.
     *
     * Mismo criterio de joins/estado que `hasPermission()`/
     * `tenantHasOtherActiveUserWithPermission()`.
     */
    public function hasOtherActiveHolderOfPermission(string $permissionCode): bool
    {
        $tenantId = $this->tenant_organization_id;

        $query = DB::table('user_roles')
            ->join('users', 'users.id', '=', 'user_roles.user_id')
            ->join('roles', 'roles.id', '=', 'user_roles.role_id')
            ->join('role_permissions', 'role_permissions.role_id', '=', 'roles.id')
            ->join('permissions', 'permissions.id', '=', 'role_permissions.permission_id')
            ->where('roles.id', '!=', $this->id)
            ->where(function ($q) use ($tenantId) {
                $q->whereNull('roles.tenant_organization_id');

                if ($tenantId !== null) {
                    $q->orWhere('roles.tenant_organization_id', $tenantId);
                }
            })
            ->where('users.is_active', true)
            ->whereNull('users.deleted_at')
            ->where('user_roles.is_active', true)
            ->whereNull('user_roles.deleted_at')
            ->where(fn ($q) => $q->whereNull('user_roles.expires_at')->orWhere('user_roles.expires_at', '>', now()))
            ->where('roles.is_active', true)
            ->whereNull('roles.deleted_at')
            ->where('role_permissions.is_active', true)
            ->whereNull('role_permissions.deleted_at')
            ->where(fn ($q) => $q->whereNull('role_permissions.expires_at')->orWhere('role_permissions.expires_at', '>', now()))
            ->where('permissions.code', $permissionCode)
            ->where('permissions.is_active', true)
            ->whereNull('permissions.deleted_at');

        $query = $tenantId === null
            ? $query->whereNull('users.tenant_organization_id')
            : $query->where('users.tenant_organization_id', $tenantId);

        return $query->exists();
    }
}
