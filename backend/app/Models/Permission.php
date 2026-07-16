<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\PermissionFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd: permissions. Nombres de código sujetos al gap de
// nomenclatura conocido (ver CLAUDE.md -> "Catálogo de Permisos.md")
// antes de sembrar datos reales.
#[Fillable(['tenant_organization_id', 'code', 'name', 'module', 'action', 'scope', 'description', 'is_system', 'is_critical', 'priority_level', 'is_active'])]
class Permission extends Model
{
    /** @use HasFactory<PermissionFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'is_system' => 'boolean',
            'is_critical' => 'boolean',
            'is_active' => 'boolean',
            'metadata' => 'array',
        ];
    }

    public function tenantOrganization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'tenant_organization_id');
    }

    /**
     * esquema-bd: permissions.created_by/updated_by (auditoría estándar) --
     * mismo patrón que Role::createdBy()/updatedBy(), usadas por
     * PermissionController::show() (Detalle de Permiso) para resolver quién
     * creó/modificó el permiso a `{id, username}` sin cargar un join
     * adicional.
     */
    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'role_permissions')
            ->using(RolePermission::class)
            ->withPivot(['assigned_by', 'assigned_at', 'expires_at', 'is_active'])
            ->withTimestamps();
    }

    /**
     * Hallazgo Medio (especialista-seguridad, 2026-07-14): mismo criterio
     * que `Role::isAccessibleBy()` -- hoy dormido (los 16 permisos reales
     * sembrados por `PermissionSeeder` son todos globales,
     * `tenant_organization_id=NULL`), pero el esquema permite un permiso
     * con tenant propio y ningún endpoint lo validaba (`index()` listaba
     * TODO el catálogo sin filtrar, `assignToRole()`/`revokeFromRole()`
     * solo validaban el ROL destino, nunca el permiso en sí). Se cierra
     * ahora mientras el patrón está fresco, antes de que exista una vía
     * real de crear permisos con tenant propio.
     */
    public function isAccessibleBy(User $actor): bool
    {
        return $this->tenant_organization_id === null
            || $this->tenant_organization_id === $actor->tenant_organization_id;
    }
}
