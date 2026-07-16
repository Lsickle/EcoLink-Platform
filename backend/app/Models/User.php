<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\HasApiTokens;

// esquema-bd: users. Autenticación Sanctum (RN-181): cookie de sesión en
// web (stateful SPA), token Bearer en móvil (HasApiTokens).
// `created_by`/`updated_by` en el Fillable a propósito -- mismo criterio que
// Role (esquema-bd): siempre se fijan server-side desde
// `$request->user()->id` (UserProvisioningService::createPendingUser() /
// UserManagementController::update()), nunca como input del cliente.
#[Fillable(['tenant_organization_id', 'organization_id', 'person_id', 'username', 'email', 'password_hash', 'user_status_id', 'created_by', 'updated_by'])]
#[Hidden(['password_hash', 'mfa_secret'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, HasUuid, Notifiable, SoftDeletes;

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password_hash' => 'hashed',
            'last_login_at' => 'datetime',
            'locked_until' => 'datetime',
            'is_mfa_enabled' => 'boolean',
            'is_active' => 'boolean',
            'metadata' => 'array',
        ];
    }

    /**
     * El esquema de EcoLink usa `password_hash`, no `password`, como
     * columna de credencial (esquema-bd, tabla users).
     */
    public function getAuthPasswordName(): string
    {
        return 'password_hash';
    }

    public function tenantOrganization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'tenant_organization_id');
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'organization_id');
    }

    public function person(): BelongsTo
    {
        return $this->belongsTo(Person::class);
    }

    public function status(): BelongsTo
    {
        return $this->belongsTo(UserStatus::class, 'user_status_id');
    }

    /**
     * esquema-bd: users.created_by/updated_by (auditoría estándar) -- mismo
     * patrón que Role::createdBy()/updatedBy(), usadas por
     * UserManagementController::show() (paridad con RoleController::show(),
     * Figma "Detalle de Usuario") para resolver quién creó/modificó el
     * usuario a `{id, username}` sin cargar un join adicional a Person.
     */
    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(self::class, 'created_by');
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(self::class, 'updated_by');
    }

    /**
     * RN-027 / CU-006.7 (D-U01): un usuario puede tener múltiples roles.
     */
    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'user_roles')
            ->using(UserRole::class)
            ->withPivot(['assigned_by', 'assigned_at', 'expires_at', 'is_active'])
            ->withTimestamps();
    }

    /**
     * RN-039: histórico de contraseñas para impedir reutilización reciente.
     */
    public function passwordHistories(): HasMany
    {
        return $this->hasMany(PasswordHistory::class);
    }

    /**
     * RN-028: los permisos se asignan siempre vía roles, nunca directo al
     * usuario -- recorre user_roles -> roles -> role_permissions ->
     * permissions. Respeta `is_active`/`expires_at` en ambos pivotes y
     * `is_active`/soft-delete en roles/permissions (mismo criterio que
     * RolePolicy/PermissionPolicy/UserPolicy, que delegan aquí).
     *
     * Se implementa con un query builder explícito (en vez de
     * `$this->roles()->whereHas(...)`) porque `wherePivot()` no está
     * disponible dentro del closure de `whereHas()` sobre una relación
     * BelongsToMany -- solo expone el query builder del modelo
     * relacionado, no la relación misma.
     */
    public function hasPermission(string $code): bool
    {
        return DB::table('user_roles')
            ->join('roles', 'roles.id', '=', 'user_roles.role_id')
            ->join('role_permissions', 'role_permissions.role_id', '=', 'roles.id')
            ->join('permissions', 'permissions.id', '=', 'role_permissions.permission_id')
            ->where('user_roles.user_id', $this->id)
            ->where('user_roles.is_active', true)
            ->whereNull('user_roles.deleted_at')
            ->where(fn ($q) => $q->whereNull('user_roles.expires_at')->orWhere('user_roles.expires_at', '>', now()))
            ->where('roles.is_active', true)
            ->whereNull('roles.deleted_at')
            ->where('role_permissions.is_active', true)
            ->whereNull('role_permissions.deleted_at')
            ->where(fn ($q) => $q->whereNull('role_permissions.expires_at')->orWhere('role_permissions.expires_at', '>', now()))
            ->where('permissions.code', $code)
            ->where('permissions.is_active', true)
            ->whereNull('permissions.deleted_at')
            ->exists();
    }

    /**
     * Hallazgo `especialista-seguridad` sobre el FRONTEND (2026-07-13): GET
     * /api/user solo exponía roles, no la lista de permisos efectivos, y el
     * frontend no podía decidir qué ocultar en el menú de administración.
     *
     * Devuelve la unión de códigos de permiso de todos los roles activos del
     * usuario -- mismo criterio y misma cadena de joins que hasPermission()
     * (RN-028), pero en una sola consulta en vez de invocar hasPermission()
     * una vez por permiso candidato.
     *
     * @return list<string>
     */
    public function effectivePermissionCodes(): array
    {
        return DB::table('user_roles')
            ->join('roles', 'roles.id', '=', 'user_roles.role_id')
            ->join('role_permissions', 'role_permissions.role_id', '=', 'roles.id')
            ->join('permissions', 'permissions.id', '=', 'role_permissions.permission_id')
            ->where('user_roles.user_id', $this->id)
            ->where('user_roles.is_active', true)
            ->whereNull('user_roles.deleted_at')
            ->where(fn ($q) => $q->whereNull('user_roles.expires_at')->orWhere('user_roles.expires_at', '>', now()))
            ->where('roles.is_active', true)
            ->whereNull('roles.deleted_at')
            ->where('role_permissions.is_active', true)
            ->whereNull('role_permissions.deleted_at')
            ->where(fn ($q) => $q->whereNull('role_permissions.expires_at')->orWhere('role_permissions.expires_at', '>', now()))
            ->where('permissions.is_active', true)
            ->whereNull('permissions.deleted_at')
            ->distinct()
            ->pluck('permissions.code')
            ->values()
            ->all();
    }

    /**
     * Aislamiento cross-tenant (hallazgo Crítico, especialista-seguridad
     * 2026-07-13): compara `tenant_organization_id` exacto -- incluyendo
     * NULL contra NULL como "mismo tenant" (usuarios sin tenant asignado
     * forman su propio grupo, no son visibles entre sí que usuarios CON
     * tenant ni viceversa). Sin jerarquía matriz-hija (RN-188) todavía --
     * señalado como pendiente explícito, no se replica aquí.
     */
    public function isSameTenantAs(User $other): bool
    {
        return $this->tenant_organization_id === $other->tenant_organization_id;
    }

    /**
     * Hallazgo Alto (especialista-seguridad, 2026-07-14, revisión del
     * mecanismo de invitación): `invitation_requests` es una cola global sin
     * frontera de tenant -- cualquier admin con `users.create` de cualquier
     * organización podía ver/aprobar/rechazar solicitudes de cualquier otra,
     * exponiendo PII de terceros sin relación con su tenant. Decisión
     * explícita del usuario del proyecto (no interpretación propia): solo el
     * staff de la organización PLATAFORMA (`organizations.is_platform_tenant
     * = true`, D-CER-04: "exactamente una fila TRUE en todo el sistema")
     * puede gestionar esa cola -- ver InvitationRequestController y
     * PlatformOrganizationSeeder (siembra la fila que hace este gate
     * satisfacible).
     */
    public function isPlatformStaff(): bool
    {
        return $this->tenantOrganization?->is_platform_tenant === true;
    }

    /**
     * Hallazgo Alto (especialista-seguridad, 2026-07-13): guarda para no
     * dejar un tenant sin ningún usuario activo capaz de gestionar el
     * ciclo de vida de otros usuarios -- usada por
     * UserManagementController::deactivate() antes de persistir, para
     * bloquear tanto la auto-desactivación del último administrador como
     * la desactivación directa de ese último administrador por otra
     * cuenta. `$excludeUserId` es el usuario que se está a punto de
     * desactivar (nunca cuenta como "otro" admin disponible).
     *
     * Mismo criterio de joins/estado que hasPermission(), pero sin atarse
     * a una instancia concreta -- es una pregunta sobre el TENANT, no
     * sobre "este" usuario.
     */
    public static function tenantHasOtherActiveUserWithPermission(?int $tenantId, int $excludeUserId, string $permissionCode): bool
    {
        $query = DB::table('users')
            ->join('user_roles', 'user_roles.user_id', '=', 'users.id')
            ->join('roles', 'roles.id', '=', 'user_roles.role_id')
            ->join('role_permissions', 'role_permissions.role_id', '=', 'roles.id')
            ->join('permissions', 'permissions.id', '=', 'role_permissions.permission_id')
            ->where('users.id', '!=', $excludeUserId)
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
