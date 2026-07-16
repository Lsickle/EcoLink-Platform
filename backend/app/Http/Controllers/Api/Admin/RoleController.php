<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Concerns\LogsSecurityEvents;
use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\SecurityLog;
use App\Models\User;
use App\Models\UserRole;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * CU-007 (Gestionar Roles) -- alcance de este lote: CRUD real de roles +
 * `assignToUser` (crea/actualiza una fila en user_roles). El motor de
 * conflictos SoD/aprobación de gobernanza descrito en el detalle de
 * CU-007.5 NO se implementa aquí (mismo patrón de sobre-diseño ya resuelto
 * en otros CU del esquema-bd, p. ej. CU-011.7/CU-012.10) -- solo la
 * asignación simple permiso<->rol/rol<->usuario pedida explícitamente por
 * el hilo principal. Señalado en el resumen.
 *
 * Hallazgo Crítico (especialista-seguridad, 2026-07-13): `assignToUser()`
 * no validaba que el `user_id` recibido perteneciera al tenant del actor --
 * un ADMINISTRADOR de cualquier organización podía asignarle un rol a un
 * usuario de OTRA organización con solo conocer su id.
 *
 * Hallazgo Crítico (especialista-seguridad, 2026-07-13, segunda pasada):
 * el mismo patrón de aislamiento aplicado a `User` faltaba por completo en
 * `Role` -- YA explotable hoy, no solo a futuro: `store()` nunca fijaba
 * `tenant_organization_id` (todo rol nacía global), `index()` listaba TODOS
 * los roles de TODOS los tenants, y `assignToUser()` no validaba el rol en
 * sí (solo el usuario destino). Cerrado con `Role::isAccessibleBy()` (ver
 * modelo Role -- semántica distinta a `User::isSameTenantAs()`).
 */
class RoleController extends Controller
{
    use LogsSecurityEvents;

    /**
     * Filtros/orden para el listado (Figma "Roles Management", lote 3):
     * `search` (name/description), `status` (active/inactive), `type`
     * (system/custom), `sort`/`direction`. `$sortableColumns` es una
     * whitelist explícita -- el valor de `sort` NUNCA se interpola en
     * `orderBy()` sin pasar por ella antes (evita SQL injection vía nombre
     * de columna).
     */
    public function index(Request $request)
    {
        Gate::authorize('viewAny', Role::class);

        $actorTenantId = $request->user()->tenant_organization_id;

        $search = $request->input('search');
        $status = $request->input('status');
        $type = $request->input('type');

        $sortableColumns = ['name', 'is_system', 'priority_level', 'is_active', 'created_at'];
        $sort = in_array($request->input('sort'), $sortableColumns, true) ? $request->input('sort') : 'name';
        $direction = strtolower((string) $request->input('direction')) === 'desc' ? 'desc' : 'asc';

        $roles = Role::query()
            ->where(function ($query) use ($actorTenantId) {
                $query->whereNull('tenant_organization_id');

                if ($actorTenantId !== null) {
                    $query->orWhere('tenant_organization_id', $actorTenantId);
                }
            })
            ->when($search, function ($query) use ($search) {
                $query->where(function ($query) use ($search) {
                    $query->where('name', 'ILIKE', "%{$search}%")
                        ->orWhere('description', 'ILIKE', "%{$search}%");
                });
            })
            ->when($status === 'active', fn ($query) => $query->where('is_active', true))
            ->when($status === 'inactive', fn ($query) => $query->where('is_active', false))
            ->when($type === 'system', fn ($query) => $query->where('is_system', true))
            ->when($type === 'custom', fn ($query) => $query->where('is_system', false))
            ->withCount('users')
            // Nota: NO se usa `wherePivot()` aquí -- dentro de un closure de
            // `withCount()`, `$query` es un Eloquent\Builder normal sobre el
            // modelo relacionado (Permission) con la tabla pivote ya
            // JOINeada (BelongsToMany::getRelationExistenceQuery()), no la
            // relación en sí -- `wherePivot()` no existe ahí y Eloquent lo
            // reinterpreta silenciosamente como un `dynamicWhere()` roto
            // (columna literal "pivot"). Verificado con `php artisan
            // tinker` antes de escribir esto. Se referencia la columna del
            // pivote ya unida directamente, mismo criterio "solo pivotes
            // activos" que `riskLevel()`.
            ->withCount(['permissions' => fn ($query) => $query->where('role_permissions.is_active', true)])
            ->orderBy($sort, $direction)
            ->paginate($request->integer('per_page', 15));

        $roles->getCollection()->transform(function (Role $role) {
            $role->setAttribute('risk_level', $this->riskLevel($role));

            return $role;
        });

        return response()->json($roles);
    }

    /**
     * Figma "Detalle de Rol", lote 4. `created_by`/`updated_by` se resuelven
     * a un objeto mínimo `{id, username}` (no el nombre completo de
     * `people.full_name` -- `Role` no tiene relación directa a `Person`, y
     * `username` ya identifica unívocamente al actor sin cargar un join
     * adicional) -- elección de forma de este lote, documentada aquí para
     * que el frontend no tenga que adivinar. `created_at`/`updated_at` ya
     * vienen en `$role->toArray()` (columnas nativas del modelo).
     *
     * Bug real (frontend "Detalle de Rol" ya construido, hallado probando en
     * navegador): `show()` nunca calculaba `users_count` -- solo `index()`
     * lo hacía vía `withCount()` -- pese a que `AdminRole`/`AdminRoleDetail`
     * (contrato ya asumido por `RoleDetailScreen.tsx`) lo declaran como
     * campo requerido. Se agrega aquí `loadCount('users')` con EXACTAMENTE
     * el mismo criterio que `index()` (sin filtro de pivote activo -- ver
     * nota en `index()` sobre por qué `wherePivot()` no aplica dentro de un
     * closure de `withCount()`) para que el mismo rol muestre el mismo
     * número en el listado y en el detalle. `permissions_count` se agrega
     * por la misma razón de honestidad de contrato (mismo filtro que
     * `index()`: solo pivotes `role_permissions.is_active=true`), aunque
     * `RoleDetailScreen.tsx` hoy deriva su propio conteo de
     * `role.permissions.length` (ya cargado completo aquí) y no lee
     * `permissions_count` directamente -- ver resumen del lote.
     */
    // Hallazgo real (verificacion en navegador, cierre de brecha CRUD de
    // Permisos vs Figma, 2026-07-14): load(['permissions', ...]) cargaba la
    // relacion SIN filtrar por role_permissions.is_active, asi que un
    // permiso revocado (nueva capacidad de este lote, ver
    // PermissionController::revokeFromRole()) seguia apareciendo en
    // role.permissions -- dormido hasta hoy porque antes de revokeFromRole()
    // ninguna fila de role_permissions podia quedar inactiva. Confirmado en
    // la vista "Comparativa" de la Matriz de Permisos. A diferencia del caso
    // ya documentado con withCount()/whereHas(), aqui SI estamos dentro del
    // closure de load() sobre la relacion real -- wherePivot() funciona.
    public function show(Role $role)
    {
        Gate::authorize('view', $role);

        $role->load([
            'permissions' => fn ($query) => $query->wherePivot('is_active', true),
            'createdBy:id,username',
            'updatedBy:id,username',
        ]);
        $role->loadCount('users');
        $role->loadCount(['permissions' => fn ($query) => $query->where('role_permissions.is_active', true)]);

        return response()->json([
            'role' => [
                ...$role->toArray(),
                'risk_level' => $this->riskLevel($role),
                'created_by' => $role->createdBy,
                'updated_by' => $role->updatedBy,
            ],
        ]);
    }

    /**
     * Figma "Detalle de Rol", lote 4 -- tab "Usuarios con este rol". Mismo
     * gate que `show()` (`roles.read` + `Role::isAccessibleBy()`, ver
     * `RolePolicy::view()`) y mismo shape de usuario que
     * `UserManagementController::index()` (`person`/`status`/`roles`), para
     * que el frontend reutilice el mismo componente de listado sin adivinar
     * una forma nueva. Solo asignaciones activas (`user_roles.is_active`),
     * mismo criterio que `destroy()`/`riskLevel()`.
     *
     * Hallazgo Crítico (especialista-seguridad, 2026-07-14): `isAccessibleBy()`
     * está pensado para gatear la DEFINICIÓN de un rol (correcto que un rol
     * GLOBAL, `tenant_organization_id` NULL, p. ej. ADMINISTRADOR, sea visible
     * por cualquier tenant), pero este método lo reutilizaba también para
     * exponer el ROSTER de personas con ese rol asignado -- sin filtro
     * adicional, un admin de cualquier tenant podía listar la PII (`person`:
     * nombre, documento, email, teléfono) de los administradores de TODAS las
     * demás organizaciones vía `GET /admin/roles/{id_administrador}/users`.
     * Mismo criterio que `UserManagementController::index()`: si el rol es
     * GLOBAL y el actor NO es `isPlatformStaff()`, el resultado se acota al
     * tenant del actor (solo ve los usuarios de SU organización con este
     * rol). Si el rol ya pertenece a un tenant específico, el gate garantiza
     * mismo tenant y no se aplica ningún filtro adicional. Si el actor SÍ es
     * platform staff, ve todo sin restricción (mismo bypass que la cola de
     * invitaciones, ver `InvitationRequestController`).
     */
    public function users(Request $request, Role $role)
    {
        Gate::authorize('view', $role);

        $actor = $request->user();

        $users = $role->users()
            ->wherePivot('is_active', true)
            ->when(
                $role->tenant_organization_id === null && ! $actor->isPlatformStaff(),
                fn ($query) => $actor->tenant_organization_id === null
                    ? $query->whereNull('users.tenant_organization_id')
                    : $query->where('users.tenant_organization_id', $actor->tenant_organization_id),
            )
            ->with(['person', 'status', 'roles'])
            ->paginate($request->integer('per_page', 15));

        return response()->json($users);
    }

    /**
     * Figma "Detalle de Rol", lote 4 -- tab "Actividad". Gateado por
     * `audit.read` directo (sin Policy de modelo, `Permission`/`Role` no
     * aplican aquí -- es un permiso simple, mismo estilo que
     * `InvitationRequestController::isPlatformStaff()` con `abort_unless`).
     *
     * AVISO -- limitación real de `security_logs` (declarada explícitamente,
     * no resuelta con una migración nueva): no existe una columna dedicada
     * `subject_type`/`subject_id` para filtrar eventos por el rol al que se
     * refieren. El filtro usado aquí depende de que `RoleController`/
     * `PermissionController` ya guarden el id del rol dentro de `metadata`
     * (jsonb) en TODAS las llamadas a `logSecurityEvent()` relacionadas con
     * roles -- confirmado por inspección de código: `role_id` en
     * ROLE_CREATED/ROLE_UPDATED/ROLE_DELETED/ROLE_ACTIVATED/
     * ROLE_DEACTIVATED/ROLE_ASSIGNED, `target_role_id` en
     * PERMISSION_ASSIGNED/PERMISSION_REVOKED (nombre de clave distinto ahí
     * porque el sujeto principal de esos eventos es el permiso, no el rol).
     * Es el filtro menos
     * malo disponible hoy: funciona porque la clave de metadata es
     * consistente por tipo de evento, pero es un acoplamiento implícito
     * (nada en el esquema garantiza que un futuro evento relacionado con
     * roles use la misma clave) -- si el catálogo de eventos crece, esto
     * debe revisarse. No se crea una columna/migración nueva sin
     * confirmarlo con el hilo principal, tal como se pidió.
     *
     * Hallazgo Crítico (especialista-seguridad, 2026-07-14): mismo problema
     * que `users()` en menor grado -- para un rol GLOBAL, el filtro por
     * `metadata->role_id` no acotaba por tenant, exponiendo la identidad de
     * actores (`user:id,username`) de OTRAS organizaciones en eventos
     * `ROLE_ASSIGNED`/`ROLE_CREATED`/etc. Se agrega el mismo criterio: si el
     * rol es GLOBAL y el actor NO es platform staff, se filtra además por
     * `security_logs.tenant_organization_id` = tenant del actor --
     * `LogsSecurityEvents::logSecurityEvent()` (única fuente de estos
     * eventos, ver AVISO arriba) siempre persiste ahí el tenant del ACTOR
     * que ejecutó la acción, nunca NULL salvo que el actor mismo no tenga
     * tenant, por eso es un filtro válido y no el caso de eventos `_CONSOLE`
     * documentado en `SecurityLog` (que no aplica a este catálogo de
     * eventos).
     */
    public function activity(Request $request, Role $role)
    {
        abort_unless($request->user()->hasPermission('audit.read'), 403, 'No tiene permiso para consultar la auditoría de roles.');

        // Mismo criterio de aislamiento que `assignToUser()`/`PermissionController::assignToRole()`
        // (`Role::isAccessibleBy()`) -- sin esto, cualquier actor con
        // `audit.read` podría enumerar la actividad de roles de OTRAS
        // organizaciones con solo conocer su id.
        if (! $role->isAccessibleBy($request->user())) {
            throw ValidationException::withMessages([
                'role' => ['El rol indicado no pertenece a tu organización.'],
            ]);
        }

        $actor = $request->user();

        $roleSubjectEvents = ['ROLE_CREATED', 'ROLE_UPDATED', 'ROLE_DELETED', 'ROLE_ACTIVATED', 'ROLE_DEACTIVATED', 'ROLE_ASSIGNED'];

        $logs = SecurityLog::query()
            ->where(function ($query) use ($role, $roleSubjectEvents) {
                $query->where(function ($query) use ($role, $roleSubjectEvents) {
                    $query->whereIn('event_type', $roleSubjectEvents)
                        ->where('metadata->role_id', $role->id);
                })->orWhere(function ($query) use ($role) {
                    // Cierra brecha CRUD de Permisos vs. Figma: revocar un
                    // permiso de este rol (PermissionController::revokeFromRole())
                    // debe quedar visible en la misma pestaña Auditoría que su
                    // contraparte de asignación -- misma clave de metadata
                    // (`target_role_id`) para ambos eventos.
                    $query->whereIn('event_type', ['PERMISSION_ASSIGNED', 'PERMISSION_REVOKED'])
                        ->where('metadata->target_role_id', $role->id);
                });
            })
            ->when(
                $role->tenant_organization_id === null && ! $actor->isPlatformStaff(),
                fn ($query) => $actor->tenant_organization_id === null
                    ? $query->whereNull('security_logs.tenant_organization_id')
                    : $query->where('security_logs.tenant_organization_id', $actor->tenant_organization_id),
            )
            ->with('user:id,username')
            // Desempate por `id` DESC: `occurred_at` puede empatar entre
            // eventos creados en la misma transacción HTTP (mismo tick de
            // reloj) -- sin esto, el orden entre ellos queda indefinido.
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

    public function store(Request $request)
    {
        Gate::authorize('create', Role::class);

        $data = $request->validate([
            'code' => ['required', 'string', 'max:100', 'unique:roles,code'],
            'name' => ['required', 'string', 'max:150', 'unique:roles,name'],
            'description' => ['nullable', 'string'],
            'priority_level' => ['nullable', 'integer', 'min:1'],
        ]);

        $role = Role::query()->create([
            ...$data,
            // Hallazgo Crítico (segunda pasada): SIEMPRE el tenant del
            // actor autenticado, nunca un input del cliente -- de lo
            // contrario todo rol creado por API nacía global (NULL),
            // visible/asignable por cualquier otra organización.
            'tenant_organization_id' => $request->user()->tenant_organization_id,
            'is_system' => false,
            'is_editable' => true,
            'is_active' => true,
            // Auditoría estándar (esquema-bd: roles.created_by/updated_by),
            // consumida por RoleController::show() -- ver docblock ahí.
            'created_by' => $request->user()->id,
            'updated_by' => $request->user()->id,
        ]);

        $this->logSecurityEvent(
            $request, 'ROLE_CREATED', 'SUCCESS',
            "Rol '{$role->code}' creado.", $request->user(), ['role_id' => $role->id],
        );

        return response()->json(['role' => $role], 201);
    }

    public function update(Request $request, Role $role)
    {
        Gate::authorize('update', $role);

        // RN-028-derivado: los roles de sistema (is_system=true, p. ej.
        // ADMINISTRADOR) se protegen con is_editable=false -- ya presente
        // en el esquema, no una columna inventada aquí.
        if (! $role->is_editable) {
            throw ValidationException::withMessages([
                'role' => ['Este rol es de sistema y no puede modificarse.'],
            ]);
        }

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:150', Rule::unique('roles', 'name')->ignore($role->id)],
            'description' => ['sometimes', 'nullable', 'string'],
            'priority_level' => ['sometimes', 'integer', 'min:1'],
        ]);

        $before = $role->only(['name', 'description', 'priority_level']);
        $role->fill($data);
        $role->updated_by = $request->user()->id;
        $role->save();

        $this->logSecurityEvent(
            $request, 'ROLE_UPDATED', 'SUCCESS',
            "Rol '{$role->code}' modificado.", $request->user(),
            ['role_id' => $role->id, 'old_values' => $before, 'new_values' => $role->only(['name', 'description', 'priority_level'])],
        );

        return response()->json(['role' => $role]);
    }

    public function destroy(Request $request, Role $role)
    {
        Gate::authorize('delete', $role);

        if (! $role->is_editable) {
            throw ValidationException::withMessages([
                'role' => ['Este rol es de sistema y no puede eliminarse.'],
            ]);
        }

        if ($role->users()->wherePivot('is_active', true)->exists()) {
            throw ValidationException::withMessages([
                'role' => ['No se puede eliminar un rol con usuarios activos asignados.'],
            ]);
        }

        $role->delete();

        $this->logSecurityEvent(
            $request, 'ROLE_DELETED', 'SUCCESS',
            "Rol '{$role->code}' eliminado.", $request->user(), ['role_id' => $role->id],
        );

        return response()->json(status: 204);
    }

    /**
     * Activar/desactivar un rol (Figma "Roles Management", lote 3). Mismo
     * patrón que `UserManagementController::activate()`/`deactivate()`,
     * pero gateado por el MISMO permiso que `update()` (`roles.update`) --
     * a diferencia de `User`, que separa `users.activate`/`users.deactivate`
     * en 2 permisos distintos, aquí activar/desactivar es una modificación
     * más del rol, no una capacidad propia (no hay spec ni permiso
     * `roles.activate`/`roles.deactivate` en el catálogo).
     *
     * Hallazgo Alto (especialista-seguridad, 2026-07-14): `deactivate()`
     * ahora bloquea (422) si, tras la desactivación, no queda ningún otro
     * usuario activo del tenant de este rol con `roles.update` por una vía
     * distinta -- mismo criterio que
     * `UserManagementController::deactivate()`, pero la exclusión es por
     * ROL (este `role_id`), no por usuario. Ver `Role::
     * hasOtherActiveHolderOfPermission()`.
     */
    public function activate(Request $request, Role $role)
    {
        Gate::authorize('update', $role);

        if (! $role->is_editable) {
            throw ValidationException::withMessages([
                'role' => ['Este rol es de sistema y no puede modificarse.'],
            ]);
        }

        $role->forceFill(['is_active' => true, 'updated_by' => $request->user()->id])->save();

        $this->logSecurityEvent(
            $request, 'ROLE_ACTIVATED', 'SUCCESS',
            "Rol '{$role->code}' activado.", $request->user(), ['role_id' => $role->id],
        );

        return response()->json(['role' => $role->fresh()]);
    }

    public function deactivate(Request $request, Role $role)
    {
        Gate::authorize('update', $role);

        if (! $role->is_editable) {
            throw ValidationException::withMessages([
                'role' => ['Este rol es de sistema y no puede modificarse.'],
            ]);
        }

        // Hallazgo Alto (especialista-seguridad, 2026-07-14): sin esta
        // guarda, desactivar el único rol que otorga `roles.update` a un
        // tenant lo dejaba sin nadie capaz de revertir la acción. Se
        // bloquea si, excluyendo ESTE rol, no queda ningún otro usuario
        // activo del tenant con `roles.update` por otra vía (incluye roles
        // GLOBALES, p. ej. ADMINISTRADOR).
        if (! $role->hasOtherActiveHolderOfPermission('roles.update')) {
            throw ValidationException::withMessages([
                'role' => ['No se puede desactivar este rol: dejaría a la organización sin nadie con permiso para revertir la acción.'],
            ]);
        }

        $role->forceFill(['is_active' => false, 'updated_by' => $request->user()->id])->save();

        $this->logSecurityEvent(
            $request, 'ROLE_DEACTIVATED', 'SUCCESS',
            "Rol '{$role->code}' desactivado.", $request->user(), ['role_id' => $role->id],
        );

        return response()->json(['role' => $role->fresh()]);
    }

    /**
     * RN-027/CU-006.7: asigna (o reactiva) un rol a un usuario.
     */
    public function assignToUser(Request $request, Role $role)
    {
        Gate::authorize('assign', Role::class);

        // Hallazgo Crítico (segunda pasada): el ROL en sí (route model
        // binding) debe ser accesible por el actor -- global o de su
        // mismo tenant. Antes solo se validaba el usuario destino.
        if (! $role->isAccessibleBy($request->user())) {
            throw ValidationException::withMessages([
                'role' => ['El rol indicado no pertenece a tu organización.'],
            ]);
        }

        $data = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'expires_at' => ['nullable', 'date', 'after:now'],
        ]);

        $targetUser = User::query()->findOrFail($data['user_id']);

        // Hallazgo Crítico: el usuario objetivo debe pertenecer al mismo
        // tenant que el actor -- ver aviso de clase.
        if (! $request->user()->isSameTenantAs($targetUser)) {
            throw ValidationException::withMessages([
                'user_id' => ['El usuario indicado no pertenece a tu organización.'],
            ]);
        }

        UserRole::query()->updateOrCreate(
            ['user_id' => $data['user_id'], 'role_id' => $role->id],
            [
                'assigned_by' => $request->user()->id,
                'assigned_at' => now(),
                'expires_at' => $data['expires_at'] ?? null,
                'is_active' => true,
            ],
        );

        $this->logSecurityEvent(
            $request, 'ROLE_ASSIGNED', 'SUCCESS',
            "Rol '{$role->code}' asignado al usuario #{$data['user_id']}.", $request->user(),
            ['role_id' => $role->id, 'target_user_id' => $data['user_id']],
        );

        return response()->json(['message' => 'Rol asignado.']);
    }

    /**
     * Indicador de riesgo del rol (campo calculado, no persistido) --
     * derivado de cuántos permisos con `is_critical=true` tiene asignados
     * el rol vía `role_permissions` (solo pivotes activos, mismo criterio
     * que `User::hasPermission()`). Umbral de 4 niveles confirmado con el
     * usuario en el lote 2 (mockup Figma Bajo/Medio/Alto/Crítico), sin RN
     * detrás -- ajustable si el negocio lo pide:
     *   0 permisos críticos      -> "bajo"
     *   1-2 permisos críticos    -> "medio"
     *   3-4 permisos críticos    -> "alto"
     *   5+ permisos críticos     -> "critico"
     */
    private function riskLevel(Role $role): string
    {
        $criticalCount = $role->permissions()
            ->wherePivot('is_active', true)
            ->where('permissions.is_critical', true)
            ->count();

        return match (true) {
            $criticalCount >= 5 => 'critico',
            $criticalCount >= 3 => 'alto',
            $criticalCount >= 1 => 'medio',
            default => 'bajo',
        };
    }
}
