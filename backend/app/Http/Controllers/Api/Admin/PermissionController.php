<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Concerns\LogsSecurityEvents;
use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\SecurityLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * CU-008 (Gestionar Permisos) -- interpretación confirmada de este lote:
 * catálogo fijo sembrado por código, de solo lectura desde la API (sin
 * create/update/delete). Se expone el listado (`permissions.read`), la
 * asignación permiso->rol (`permissions.assign`) y, desde el cierre de
 * brecha CRUD vs. Figma, la REVOCACIÓN permiso<->rol (`permissions.assign`,
 * misma capacidad -- es la contraparte de `assignToRole()`) más un conjunto
 * de endpoints de solo lectura para nutrir el Detalle de Permiso y la
 * Matriz de Permisos del frontend.
 *
 * Hallazgo Crítico (especialista-seguridad, 2026-07-13): `assignToRole()`
 * no validaba que el `role_id` recibido perteneciera al tenant del actor.
 * `roles.tenant_organization_id = NULL` sigue siendo válido (catálogo
 * global de sistema, ej. ADMINISTRADOR -- confirmado en
 * roles-canonicos.md, NO se le pone tenant); lo que se bloquea es asignar
 * un permiso a un rol que pertenezca EXPLÍCITAMENTE a OTRO tenant distinto
 * del actor. `revokeFromRole()` reutiliza el mismo chequeo.
 *
 * AVISO de patrón -- `wherePivot()` dentro de un closure de `whereHas()`:
 * Eloquent NO expone la relación (`BelongsToMany`) dentro de ese closure,
 * solo un `Builder` plano sobre el modelo relacionado con el pivote ya
 * JOINeado (`Relation::getRelationExistenceQuery()`) -- igual que el caso
 * ya documentado en `RoleController::index()` para `withCount()`.
 * `wherePivot()` no existe ahí y Eloquent lo reinterpreta silenciosamente
 * como un `dynamicWhere()` roto sobre una columna literal `"pivot"`
 * (verificado con `php artisan tinker` antes de escribir esto: el SQL
 * generado queda `... and "pivot" = ?`, un WHERE que nunca es cierto). Por
 * eso `show()`/`users()` referencian la columna del pivote ya unida
 * directamente (`user_roles.is_active`), nunca `wherePivot()`, dentro de
 * los closures de `whereHas()`.
 */
class PermissionController extends Controller
{
    use LogsSecurityEvents;

    /**
     * Filtros/orden del catálogo (cierre de brecha CRUD vs. Figma): `search`
     * (code/name), `module` (igualdad exacta), `status` (active/inactive),
     * `critical` (true/false), `sort`/`direction` con whitelist explícita --
     * mismo patrón que `RoleController::index()`, el valor de `sort` NUNCA
     * se interpola en `orderBy()` sin pasar por ella antes.
     */
    public function index(Request $request)
    {
        Gate::authorize('viewAny', Permission::class);

        $actorTenantId = $request->user()->tenant_organization_id;

        $search = $request->input('search');
        $module = $request->input('module');
        $status = $request->input('status');
        $critical = $request->input('critical');

        $sortableColumns = ['code', 'name', 'module', 'priority_level', 'is_active', 'created_at'];
        $sort = in_array($request->input('sort'), $sortableColumns, true) ? $request->input('sort') : 'code';
        $direction = strtolower((string) $request->input('direction')) === 'desc' ? 'desc' : 'asc';

        $permissions = Permission::query()
            // Hallazgo Medio (especialista-seguridad, 2026-07-14): dormido
            // hoy (los 16 permisos reales son globales), pero sin este
            // filtro el catálogo completo de TODOS los tenants quedaría
            // visible en cuanto exista un permiso con tenant propio. Mismo
            // criterio que `RoleController::index()`.
            ->where(function ($query) use ($actorTenantId) {
                $query->whereNull('tenant_organization_id');

                if ($actorTenantId !== null) {
                    $query->orWhere('tenant_organization_id', $actorTenantId);
                }
            })
            ->when($search, function ($query) use ($search) {
                $query->where(function ($query) use ($search) {
                    $query->where('code', 'ILIKE', "%{$search}%")
                        ->orWhere('name', 'ILIKE', "%{$search}%");
                });
            })
            ->when($module, fn ($query) => $query->where('module', $module))
            ->when($status === 'active', fn ($query) => $query->where('is_active', true))
            ->when($status === 'inactive', fn ($query) => $query->where('is_active', false))
            ->when($critical === 'true', fn ($query) => $query->where('is_critical', true))
            ->when($critical === 'false', fn ($query) => $query->where('is_critical', false))
            // Nota: NO se usa `wherePivot()` aquí -- dentro de un closure de
            // `withCount()`, `$query` es un Eloquent\Builder normal sobre el
            // modelo relacionado (Role) con la tabla pivote ya JOINeada
            // (BelongsToMany::getRelationExistenceQuery()), no la relación en
            // sí -- `wherePivot()` no existe ahí y Eloquent lo reinterpreta
            // silenciosamente como un `dynamicWhere()` roto (columna literal
            // "pivot"). Mismo criterio ya documentado en
            // `RoleController::index()`. Se referencia la columna del
            // pivote ya unida directamente, mismo criterio "solo pivotes
            // activos" que el resto del módulo.
            ->withCount(['roles' => fn ($query) => $query->where('role_permissions.is_active', true)])
            ->orderBy($sort, $direction)
            ->paginate($request->integer('per_page', 50));

        return response()->json($permissions);
    }

    /**
     * Detalle de Permiso (Figma). `created_by`/`updated_by` se resuelven a
     * `{id, username}`, mismo criterio de forma que `RoleController::show()`.
     * `users_impacted_count`: usuarios DISTINTOS con este permiso activo vía
     * algún rol activo, acotado al tenant del actor salvo `isPlatformStaff()`
     * -- además del `Permission::isAccessibleBy()` que ya gatea `view()` en
     * la Policy, el aislamiento aquí se aplica también sobre los USUARIOS
     * devueltos (que siempre pertenecen a un tenant concreto).
     */
    public function show(Request $request, Permission $permission)
    {
        Gate::authorize('view', $permission);

        $actor = $request->user();

        $permission->load(['createdBy:id,username', 'updatedBy:id,username']);
        $permission->loadCount(['roles' => fn ($query) => $query->where('role_permissions.is_active', true)]);

        return response()->json([
            'permission' => [
                ...$permission->toArray(),
                'created_by' => $permission->createdBy,
                'updated_by' => $permission->updatedBy,
                'roles_count' => $permission->roles_count,
                'users_impacted_count' => $this->usersImpactedCount($permission, $actor),
            ],
        ]);
    }

    /**
     * Tab "Roles" del Detalle de Permiso: roles con este permiso activo,
     * acotados por la MISMA visibilidad de tenant que
     * `RoleController::index()` (rol global O del tenant del actor, sin
     * restricción si `isPlatformStaff()`).
     */
    public function roles(Request $request, Permission $permission)
    {
        Gate::authorize('view', $permission);

        $actor = $request->user();
        $actorTenantId = $actor->tenant_organization_id;

        $roles = $permission->roles()
            ->wherePivot('is_active', true)
            ->when(! $actor->isPlatformStaff(), function ($query) use ($actorTenantId) {
                $query->where(function ($query) use ($actorTenantId) {
                    $query->whereNull('roles.tenant_organization_id');

                    if ($actorTenantId !== null) {
                        $query->orWhere('roles.tenant_organization_id', $actorTenantId);
                    }
                });
            })
            ->paginate($request->integer('per_page', 15));

        return response()->json($roles);
    }

    /**
     * Tab "Usuarios" del Detalle de Permiso. Mismo shape que
     * `RoleController::users()` (`person`/`status`/`roles`), pero la
     * restricción de tenant es SIEMPRE por `users.tenant_organization_id`
     * del actor salvo `isPlatformStaff()` -- a diferencia de `Role`, los
     * usuarios siempre pertenecen a un tenant concreto (no hay "usuario
     * global"), confirmado en el cierre del CRUD de Usuarios.
     */
    public function users(Request $request, Permission $permission)
    {
        Gate::authorize('view', $permission);

        $actor = $request->user();

        $users = User::query()
            ->whereHas('roles', function (Builder $query) use ($permission) {
                $query->where('user_roles.is_active', true)
                    ->whereHas('permissions', function (Builder $query) use ($permission) {
                        $query->where('permissions.id', $permission->id)
                            ->where('role_permissions.is_active', true);
                    });
            })
            ->when(! $actor->isPlatformStaff(), fn ($query) => $query->where('users.tenant_organization_id', $actor->tenant_organization_id))
            ->with(['person', 'status', 'roles'])
            ->paginate($request->integer('per_page', 15));

        return response()->json($users);
    }

    /**
     * Tab "Auditoría" del Detalle de Permiso -- mismo patrón que
     * `RoleController::activity()` (permiso simple `audit.read`, sin Policy
     * de modelo). A diferencia de `Role::activity()` (donde el filtro de
     * tenant es condicional, solo para roles GLOBALES), aquí el permiso ES
     * global por diseño (catálogo fijo, sin `isAccessibleBy()`) -- el
     * filtro por `security_logs.tenant_organization_id` se aplica SIEMPRE
     * que el actor no sea platform staff.
     */
    public function activity(Request $request, Permission $permission)
    {
        abort_unless($request->user()->hasPermission('audit.read'), 403, 'No tiene permiso para consultar la auditoría de permisos.');

        $actor = $request->user();

        $logs = SecurityLog::query()
            ->whereIn('event_type', ['PERMISSION_ASSIGNED', 'PERMISSION_REVOKED'])
            ->where('metadata->permission_id', $permission->id)
            ->when(! $actor->isPlatformStaff(), fn ($query) => $query->where('security_logs.tenant_organization_id', $actor->tenant_organization_id))
            ->with('user:id,username')
            // Desempate por `id` DESC: mismo criterio que `RoleController::activity()`.
            ->orderByDesc('occurred_at')
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 15));

        $logs->getCollection()->transform(fn ($log) => [
            'event_type' => $log->event_type,
            'description' => $log->description,
            'actor' => $log->user,
            'created_at' => $log->occurred_at,
        ]);

        return response()->json($logs);
    }

    /**
     * Vista "Matriz de Permisos por Módulo" (Figma). Grid permisos-del-
     * módulo x roles-visibles-al-actor, con `assignments` construido en UNA
     * sola query a `role_permissions` (sin N+1 por permiso/rol).
     */
    public function matrixByModule(Request $request)
    {
        Gate::authorize('viewAny', Permission::class);

        $actor = $request->user();

        $data = $request->validate([
            'module' => ['required', 'string', Rule::in(Permission::query()->distinct()->pluck('module')->all())],
        ]);

        $actorTenantId = $actor->tenant_organization_id;

        $permissions = Permission::query()
            ->where('module', $data['module'])
            ->where('is_active', true)
            // Mismo filtro de accesibilidad que `index()` -- ver
            // `Permission::isAccessibleBy()`.
            ->where(function ($query) use ($actorTenantId) {
                $query->whereNull('tenant_organization_id');

                if ($actorTenantId !== null) {
                    $query->orWhere('tenant_organization_id', $actorTenantId);
                }
            })
            ->orderBy('code')
            ->get();

        $roles = Role::query()
            ->when(! $actor->isPlatformStaff(), function ($query) use ($actorTenantId) {
                $query->where(function ($query) use ($actorTenantId) {
                    $query->whereNull('tenant_organization_id');

                    if ($actorTenantId !== null) {
                        $query->orWhere('tenant_organization_id', $actorTenantId);
                    }
                });
            })
            ->orderBy('name')
            ->get();

        $permissionIds = $permissions->pluck('id');
        $roleIds = $roles->pluck('id');

        $assignmentsByPermission = DB::table('role_permissions')
            ->whereIn('permission_id', $permissionIds)
            ->whereIn('role_id', $roleIds)
            ->where('is_active', true)
            ->get(['permission_id', 'role_id'])
            ->groupBy('permission_id')
            ->map(fn ($rows) => $rows->pluck('role_id')->values()->all());

        $assignments = $permissionIds
            ->mapWithKeys(fn ($id) => [(string) $id => $assignmentsByPermission->get($id, [])])
            ->all();

        return response()->json([
            'module' => $data['module'],
            'permissions' => $permissions,
            'roles' => $roles,
            'assignments' => $assignments,
        ]);
    }

    /**
     * RN-028: asigna (o reactiva) un permiso existente a un rol.
     */
    public function assignToRole(Request $request, Permission $permission)
    {
        Gate::authorize('assign', Permission::class);

        $data = $request->validate([
            'role_id' => ['required', 'integer', 'exists:roles,id'],
            'expires_at' => ['nullable', 'date', 'after:now'],
        ]);

        // Hallazgo Medio: el permiso en sí también debe ser accesible por
        // el actor (dormido hoy, todos los permisos reales son globales,
        // pero el esquema permite un permiso con tenant propio).
        if (! $permission->isAccessibleBy($request->user())) {
            throw ValidationException::withMessages([
                'permission_id' => ['El permiso indicado no pertenece a tu organización.'],
            ]);
        }

        $targetRole = Role::query()->findOrFail($data['role_id']);

        // Hallazgo Crítico: NULL = catálogo global (asignable por
        // cualquier tenant, ver aviso de clase); si el rol SÍ tiene un
        // tenant propio, debe coincidir con el del actor. Misma regla que
        // RoleController::assignToUser() -- ver Role::isAccessibleBy().
        if (! $targetRole->isAccessibleBy($request->user())) {
            throw ValidationException::withMessages([
                'role_id' => ['El rol indicado no pertenece a tu organización.'],
            ]);
        }

        RolePermission::query()->updateOrCreate(
            ['role_id' => $data['role_id'], 'permission_id' => $permission->id],
            [
                'assigned_by' => $request->user()->id,
                'assigned_at' => now(),
                'expires_at' => $data['expires_at'] ?? null,
                'is_active' => true,
            ],
        );

        $this->logSecurityEvent(
            $request, 'PERMISSION_ASSIGNED', 'SUCCESS',
            "Permiso '{$permission->code}' asignado al rol #{$data['role_id']}.", $request->user(),
            ['permission_id' => $permission->id, 'target_role_id' => $data['role_id']],
        );

        return response()->json(['message' => 'Permiso asignado.']);
    }

    /**
     * Contraparte de `assignToRole()` -- gap real encontrado (hoy solo se
     * podía asignar, nunca revocar): pone `role_permissions.is_active =
     * false` para el par rol/permiso. Idempotente -- revocar un permiso que
     * ya está inactivo, o que nunca se asignó, sigue siendo éxito, no error
     * (mismo criterio "no-op exitoso" que `assignToRole()`/`updateOrCreate`).
     */
    public function revokeFromRole(Request $request, Permission $permission)
    {
        Gate::authorize('assign', Permission::class);

        $data = $request->validate([
            'role_id' => ['required', 'integer', 'exists:roles,id'],
        ]);

        if (! $permission->isAccessibleBy($request->user())) {
            throw ValidationException::withMessages([
                'permission_id' => ['El permiso indicado no pertenece a tu organización.'],
            ]);
        }

        $targetRole = Role::query()->findOrFail($data['role_id']);

        if (! $targetRole->isAccessibleBy($request->user())) {
            throw ValidationException::withMessages([
                'role_id' => ['El rol indicado no pertenece a tu organización.'],
            ]);
        }

        RolePermission::query()
            ->where('role_id', $data['role_id'])
            ->where('permission_id', $permission->id)
            ->update(['is_active' => false]);

        $this->logSecurityEvent(
            $request, 'PERMISSION_REVOKED', 'SUCCESS',
            "Permiso '{$permission->code}' revocado del rol #{$data['role_id']}.", $request->user(),
            ['permission_id' => $permission->id, 'target_role_id' => $data['role_id']],
        );

        return response()->json(['message' => 'Permiso revocado.']);
    }

    /**
     * Ver AVISO de patrón en el docblock de clase -- referencia directa a
     * las columnas del pivote ya unido (`user_roles.is_active`,
     * `role_permissions.is_active`), nunca `wherePivot()`, dentro de
     * closures de `whereHas()`.
     */
    private function usersImpactedCount(Permission $permission, User $actor): int
    {
        return User::query()
            ->whereHas('roles', function (Builder $query) use ($permission) {
                $query->where('user_roles.is_active', true)
                    ->whereHas('permissions', function (Builder $query) use ($permission) {
                        $query->where('permissions.id', $permission->id)
                            ->where('role_permissions.is_active', true);
                    });
            })
            ->when(! $actor->isPlatformStaff(), fn ($query) => $query->where('tenant_organization_id', $actor->tenant_organization_id))
            ->count();
    }
}
