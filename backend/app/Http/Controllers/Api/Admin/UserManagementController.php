<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Concerns\LogsSecurityEvents;
use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\SecurityLog;
use App\Models\User;
use App\Models\UserInvitation;
use App\Models\UserRole;
use App\Models\UserStatus;
use App\Services\PasswordResetOtpService;
use App\Services\UserProvisioningService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * CU-006 (Gestionar Usuarios) -- alcance acumulado: index/store/show/
 * update/activate/deactivate/resendInvitation +
 * revokeRole/resetPassword/activity (lote de cierre de brecha con Figma,
 * 2026-07-14). `resetPassword` (CU-006.9) sigue sin spec fuente confirmada
 * -- se construyó igual, reutilizando el mecanismo OTP ya existente de
 * `PasswordRecoveryController` (ver `PasswordResetOtpService`), señalado en
 * el resumen entregado al hilo principal como criterio propio sin CU-006.9
 * verificado literalmente.
 *
 * AVISO -- desviaciones deliberadas de la spec CU-006.1, señaladas en el
 * resumen: (a) `organization_id`/`branch_id` quedan opcionales (el módulo
 * Organizaciones está fuera de alcance de este lote, sin seed/factory
 * disponible -- exigirlos habría forzado a inventar datos de organización);
 * (b) se pide `username`/`document_type`/`document_number` aunque el
 * listado literal de "Datos de Entrada" de CU-006.1 no los incluye -- son
 * NOT NULL en el esquema real (`users`/`people`).
 *
 * Mecanismo de invitación (reemplaza el registro público, `AuthController::
 * register()` eliminado): `store()` YA NO acepta `password`/
 * `password_confirmation` ni el toggle "Estado Inicial" -- todo usuario
 * nuevo nace SIEMPRE `PENDING_ACTIVATION` (código confirmado en
 * `UserStatusSeeder`), con `password_hash` fijado a un placeholder aleatorio
 * inutilizable (`Hash::make(Str::random(64))`, nadie puede autenticarse con
 * él). La activación real ocurre cuando el usuario acepta su invitación vía
 * `InvitationController::accept()`. La emisión de la invitación (token +
 * notificación) se extrajo a `UserInvitation::issueFor()` -- reutilizado tal
 * cual por `resendInvitation()` abajo y, en la SIGUIENTE tarea (solicitudes
 * de invitación), por el flujo de aprobación de una solicitud.
 *
 * Hallazgo Crítico (especialista-seguridad, 2026-07-13): ningún endpoint
 * scopeaba por `tenant_organization_id`, permitiendo a un ADMINISTRADOR de
 * cualquier organización listar/ver/editar/activar/desactivar usuarios de
 * CUALQUIER otra organización. `index()` ahora filtra por el tenant del
 * actor; `show/update/activate/deactivate` heredan el filtro desde la
 * Policy (ver UserPolicy). `store()` fija `tenant_organization_id` del
 * usuario creado al del actor -- server-side, no aceptado como input del
 * cliente (evita que un admin cree usuarios bajo el tenant de otro).
 * `resendInvitation()` delega en `UserPolicy::resendInvitation()`
 * (`Gate::authorize('resendInvitation', $user)`, vía route model binding) --
 * mismo mecanismo que `show/update/activate/deactivate`. Hasta 2026-07-14
 * replicaba manualmente `isSameTenantAs()` en el controller (deuda
 * arquitectónica de bajo riesgo, señalada en la revisión de seguridad del
 * 2026-07-13); se movió a la Policy para no ser la única acción de esta
 * clase con el chequeo de tenant fuera de su lugar habitual.
 */
class UserManagementController extends Controller
{
    use LogsSecurityEvents;

    /**
     * Filtros/orden para el listado (paridad con RoleController::index(),
     * lote 3/4 -- mismo patrón EXACTO): `search` (nombre completo vía
     * `person.full_name`, `email`, `username`), `status` (código de
     * `UserStatus`), `role` (código de rol, solo asignaciones ACTIVAS en
     * `user_roles`), `sort`/`direction`. `$sortableColumns` es una
     * whitelist explícita SOLO de columnas directas de `users` -- nunca
     * columnas de `person` (mismo criterio pedido: mantenerlo simple sobre
     * columnas directas). El scoping por tenant del actor se mantiene
     * intacto y se combina con `AND` sobre los filtros nuevos.
     */
    public function index(Request $request)
    {
        Gate::authorize('viewAny', User::class);

        $actorTenantId = $request->user()->tenant_organization_id;

        $search = $request->input('search');
        $status = $request->input('status');
        $roleCode = $request->input('role');

        $sortableColumns = ['created_at', 'last_login_at', 'email', 'username'];
        $sort = in_array($request->input('sort'), $sortableColumns, true) ? $request->input('sort') : 'created_at';
        $direction = strtolower((string) $request->input('direction')) === 'asc' ? 'asc' : 'desc';

        $users = User::query()
            ->when(
                $actorTenantId === null,
                fn ($q) => $q->whereNull('tenant_organization_id'),
                fn ($q) => $q->where('tenant_organization_id', $actorTenantId),
            )
            ->when($search, function ($query) use ($search) {
                $query->where(function ($query) use ($search) {
                    $query->where('email', 'ILIKE', "%{$search}%")
                        ->orWhere('username', 'ILIKE', "%{$search}%")
                        ->orWhereHas('person', fn ($q) => $q->where('full_name', 'ILIKE', "%{$search}%"));
                });
            })
            ->when($status, fn ($query) => $query->whereHas('status', fn ($q) => $q->where('code', $status)))
            // Nota: `wherePivot()` no aplica dentro del closure de
            // `whereHas()` sobre una BelongsToMany (mismo hallazgo ya
            // documentado en RoleController::index()/User::hasPermission()
            // -- el closure recibe el Builder del modelo relacionado con la
            // pivote ya JOINeada, no la relación en sí) -- se referencia la
            // columna del pivote ya unida directamente.
            ->when($roleCode, fn ($query) => $query->whereHas('roles', fn ($q) => $q->where('code', $roleCode)->where('user_roles.is_active', true)))
            ->with(['person', 'status', 'roles'])
            ->orderBy($sort, $direction)
            ->paginate($request->integer('per_page', 15));

        return response()->json($users);
    }

    public function store(Request $request)
    {
        Gate::authorize('create', User::class);

        $data = $request->validate([
            'first_name' => ['required', 'string', 'max:100'],
            'middle_name' => ['nullable', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'second_last_name' => ['nullable', 'string', 'max:100'],
            'document_type' => ['required', 'string', 'max:20'],
            'document_number' => ['required', 'string', 'max:50', 'unique:people,document_number'],
            'username' => ['required', 'string', 'max:100', 'unique:users,username'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email', 'unique:people,email'],
            'phone' => ['nullable', 'string', 'max:50'],
            // RN-027 (CU-006.7): todo usuario debe tener al menos un rol.
            'role_ids' => ['required', 'array', 'min:1'],
            'role_ids.*' => ['integer', 'distinct', 'exists:roles,id'],
            'organization_id' => ['nullable', 'integer', 'exists:organizations,id'],
        ]);

        // Punto de reutilización (ver docblock de clase): el bloque
        // Person+User+PasswordHistory+roles+UserInvitation::issueFor() se
        // extrajo a UserProvisioningService::createPendingUser() -- la
        // SIGUIENTE tarea (aprobación de solicitudes de invitación) lo
        // reutiliza EXACTAMENTE igual en vez de duplicarlo.
        $user = UserProvisioningService::createPendingUser($data, $request->user());

        // RN-038/RN-151: toda operación crítica se registra en auditoría.
        $this->logSecurityEvent(
            $request,
            'USER_CREATED_BY_ADMIN',
            'SUCCESS',
            "Usuario '{$user->username}' creado por administrador.",
            $request->user(),
            ['created_user_id' => $user->id],
        );

        $this->logSecurityEvent(
            $request,
            'USER_INVITED',
            'SUCCESS',
            "Invitación enviada a '{$user->username}'.",
            $request->user(),
            ['target_user_id' => $user->id],
        );

        return response()->json([
            'user' => $user->fresh(['person', 'status', 'roles']),
        ], 201);
    }

    /**
     * Reenvío de invitación (CU-006.1 modificado, no un CU-006.X propio de
     * spec fuente -- consecuencia directa del mecanismo de invitación).
     * Gateado por el MISMO permiso que `store()` (`users.create`) -- crear
     * un usuario y reenviarle el acceso son la misma capacidad
     * administrativa. 422 si el usuario ya está `ACTIVE` (ya aceptó la
     * invitación, o fue activado por otra vía -- nada que reenviar).
     */
    public function resendInvitation(Request $request, User $user)
    {
        Gate::authorize('resendInvitation', $user);

        if ($user->status->code === 'ACTIVE') {
            throw ValidationException::withMessages([
                'user' => ['El usuario ya está activo -- no hay ninguna invitación pendiente que reenviar.'],
            ]);
        }

        // Mismo método reutilizable de store() -- regenera token+expires_at
        // sobre la fila existente (upsert por user_id, ver UserInvitation::
        // issueFor()) y reenvía el correo. resend_count se incrementa aparte
        // porque issueFor() lo excluye deliberadamente de sus columnas de
        // upsert (no debe resetearse en cada llamada).
        UserInvitation::issueFor($user, $request->user());
        UserInvitation::query()->where('user_id', $user->id)->increment('resend_count');

        $this->logSecurityEvent(
            $request,
            'INVITATION_RESENT',
            'SUCCESS',
            "Invitación reenviada a '{$user->username}'.",
            $request->user(),
            ['target_user_id' => $user->id],
        );

        return response()->json(['message' => 'Invitación reenviada.']);
    }

    public function show(User $user)
    {
        Gate::authorize('view', $user);

        return response()->json([
            'user' => $user->load(['person', 'status', 'roles', 'createdBy:id,username', 'updatedBy:id,username']),
        ]);
    }

    public function update(Request $request, User $user)
    {
        Gate::authorize('update', $user);

        $data = $request->validate([
            'email' => ['sometimes', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'phone' => ['sometimes', 'nullable', 'string', 'max:50'],
            'first_name' => ['sometimes', 'string', 'max:100'],
            'last_name' => ['sometimes', 'string', 'max:100'],
            'organization_id' => ['sometimes', 'nullable', 'integer', 'exists:organizations,id'],
        ]);

        $before = $user->only(['email', 'organization_id']);

        DB::transaction(function () use ($data, $user, $request) {
            if (array_intersect_key($data, array_flip(['first_name', 'last_name', 'phone']))) {
                $user->person?->update(array_intersect_key($data, array_flip(['first_name', 'last_name', 'phone'])));
            }

            $user->fill(array_intersect_key($data, array_flip(['email', 'organization_id'])));
            // esquema-bd: users.updated_by -- mismo criterio que
            // RoleController::update(), resuelto por show() vía
            // User::updatedBy().
            $user->updated_by = $request->user()->id;
            $user->save();
        });

        // RN-038: cambio de datos de usuario registrado con old/new values.
        $this->logSecurityEvent(
            $request,
            'USER_UPDATED_BY_ADMIN',
            'SUCCESS',
            "Usuario '{$user->username}' modificado por administrador.",
            $request->user(),
            ['target_user_id' => $user->id, 'old_values' => $before, 'new_values' => $user->only(['email', 'organization_id'])],
        );

        return response()->json(['user' => $user->fresh(['person', 'status', 'roles'])]);
    }

    /**
     * CU-006.4: activar usuario. Hallazgo Medio (especialista-seguridad,
     * 2026-07-13): gateado por `users.activate` en exclusiva -- ya no cubre
     * también `deactivate()` (ver UserPolicy).
     */
    public function activate(Request $request, User $user)
    {
        Gate::authorize('activate', $user);

        $status = UserStatus::query()->where('code', 'ACTIVE')->firstOrFail();
        $user->forceFill(['user_status_id' => $status->id, 'is_active' => true])->save();

        $this->logSecurityEvent(
            $request,
            'USER_ACTIVATED',
            'SUCCESS',
            "Usuario '{$user->username}' activado por administrador.",
            $request->user(),
            ['target_user_id' => $user->id],
        );

        return response()->json(['user' => $user->fresh(['status'])]);
    }

    public function deactivate(Request $request, User $user)
    {
        Gate::authorize('deactivate', $user);

        // Hallazgo Alto (especialista-seguridad, 2026-07-13): sin esta
        // guarda, un ADMINISTRADOR podía auto-desactivarse o desactivar al
        // último ADMINISTRADOR activo de su tenant, dejando la organización
        // sin nadie que pueda gestionar el ciclo de vida de usuarios. Se
        // bloquea si, tras esta desactivación, no queda NINGÚN otro usuario
        // activo del mismo tenant con permiso `users.deactivate` (la
        // capacidad que gobierna esta misma acción).
        if (! User::tenantHasOtherActiveUserWithPermission($user->tenant_organization_id, $user->id, 'users.deactivate')) {
            throw ValidationException::withMessages([
                'user' => ['No se puede desactivar: dejaría a la organización sin ningún administrador activo.'],
            ]);
        }

        $status = UserStatus::query()->where('code', 'INACTIVE')->firstOrFail();
        $user->forceFill(['user_status_id' => $status->id, 'is_active' => false])->save();

        // CU-006.4 paso 5: revoca tokens/sesiones activas del usuario
        // inactivado. Hallazgo Alto (especialista-seguridad, 2026-07-13):
        // antes solo se revocaban tokens Bearer -- una sesión web (cookie,
        // SESSION_DRIVER=database) seguía viva. Mismo patrón que
        // PasswordRecoveryController::reset() para invalidar la sesión web
        // -- ver aviso ahí sobre la dependencia de SESSION_DRIVER=database.
        $user->tokens()->delete();
        DB::table('sessions')->where('user_id', $user->id)->delete();

        $this->logSecurityEvent(
            $request,
            'USER_DEACTIVATED',
            'SUCCESS',
            "Usuario '{$user->username}' inactivado por administrador.",
            $request->user(),
            ['target_user_id' => $user->id],
        );

        return response()->json(['user' => $user->fresh(['status'])]);
    }

    /**
     * Revoca (desactiva -- RN-027 exige AL MENOS un rol activo, nunca se
     * borra la fila, mismo criterio "solo desactivar" ya usado en todo el
     * proyecto) un rol asignado a un usuario. Inverso de
     * `RoleController::assignToUser()` -- mismo gate (`roles.assign`, vía
     * `RolePolicy::assign()`) y mismo doble chequeo de tenant: el ROL (route
     * model binding) debe ser accesible por el actor (`Role::isAccessibleBy()`,
     * global o de su mismo tenant) y el USUARIO objetivo debe pertenecer al
     * mismo tenant que el actor (`User::isSameTenantAs()`).
     */
    public function revokeRole(Request $request, User $user, Role $role)
    {
        Gate::authorize('assign', Role::class);

        if (! $role->isAccessibleBy($request->user())) {
            throw ValidationException::withMessages([
                'role' => ['El rol indicado no pertenece a tu organización.'],
            ]);
        }

        if (! $request->user()->isSameTenantAs($user)) {
            throw ValidationException::withMessages([
                'user' => ['El usuario indicado no pertenece a tu organización.'],
            ]);
        }

        // Hallazgo Medio (especialista-seguridad, 2026-07-14): condición de
        // carrera en la guarda RN-027 -- antes el conteo de roles activos y
        // la desactivación ocurrían en pasos separados sin bloqueo; dos
        // revocaciones concurrentes sobre roles DISTINTOS del mismo usuario
        // podían pasar ambas el chequeo "<= 1" (cada una viendo el estado
        // previo a que la otra confirmara) y dejar al usuario sin ningún
        // rol activo. Se serializa con `lockForUpdate()` sobre las filas
        // `user_roles` ACTIVAS de este usuario dentro de una transacción:
        // la segunda revocación concurrente espera a que la primera
        // confirme (o revierta) antes de poder contar, viendo siempre el
        // estado ya actualizado.
        DB::transaction(function () use ($user, $role) {
            $activeUserRoles = UserRole::query()
                ->where('user_id', $user->id)
                ->where('is_active', true)
                ->lockForUpdate()
                ->get();

            $pivot = $activeUserRoles->firstWhere('role_id', $role->id);

            if (! $pivot) {
                throw ValidationException::withMessages([
                    'role' => ['Este rol no está actualmente asignado (activo) a este usuario.'],
                ]);
            }

            // RN-027 (CU-006.7): todo usuario debe conservar al menos un
            // rol activo -- se cuenta ANTES de desactivar, dentro del mismo
            // bloqueo, para que la comparación sea atómica respecto a
            // cualquier otra revocación concurrente.
            if ($activeUserRoles->count() <= 1) {
                throw ValidationException::withMessages([
                    'role' => ['No se puede revocar: el usuario debe conservar al menos un rol activo.'],
                ]);
            }

            $pivot->forceFill(['is_active' => false])->save();
        });

        $this->logSecurityEvent(
            $request, 'ROLE_REVOKED', 'SUCCESS',
            "Rol '{$role->code}' revocado al usuario '{$user->username}'.", $request->user(),
            ['role_id' => $role->id, 'target_user_id' => $user->id],
        );

        return response()->json(['message' => 'Rol revocado.']);
    }

    /**
     * CU-006.9: restablecimiento de contraseña disparado por un
     * ADMINISTRADOR sobre un usuario OBJETIVO -- reutiliza EXACTAMENTE el
     * mismo mecanismo OTP del autoservicio
     * (`PasswordRecoveryController::forgot()`), extraído a
     * `PasswordResetOtpService::issueFor()` para no duplicar esa lógica.
     * Dirigido SIEMPRE al correo de `$user` (el objetivo), nunca al del
     * actor que ejecuta la acción.
     *
     * Evento de auditoría DISTINTO al del autoservicio
     * (`PASSWORD_RESET_REQUESTED`) a propósito -- `PASSWORD_RESET_BY_ADMIN`
     * deja trazabilidad de que fue una acción administrativa. El actor ya
     * queda identificado por la columna `security_logs.user_id`
     * (`logSecurityEvent()` la fija desde `$request->user()`), pero se
     * repite explícitamente como `admin_user_id` en `metadata` junto a
     * `target_user_id` -- pedido explícito de la tarea, para que el filtro
     * de `activity()` (que lee `metadata->target_user_id`) no dependa de
     * inspeccionar la columna del log por separado.
     */
    public function resetPassword(Request $request, User $user)
    {
        Gate::authorize('resetPassword', $user);

        PasswordResetOtpService::issueFor($user);

        $this->logSecurityEvent(
            $request,
            'PASSWORD_RESET_BY_ADMIN',
            'SUCCESS',
            "Restablecimiento de contraseña disparado por administrador para '{$user->username}'.",
            $request->user(),
            ['target_user_id' => $user->id, 'admin_user_id' => $request->user()->id],
        );

        return response()->json(['message' => 'Se envió un código de verificación al correo del usuario para restablecer su contraseña.']);
    }

    /**
     * Figma "Detalle de Usuario" -- tab "Actividad". Mismo patrón EXACTO
     * que `RoleController::activity()`: gateado por `audit.read` directo
     * (`abort_unless`, sin Policy de modelo), paginado, `actor` resuelto a
     * `{id, username}`, orden `occurred_at DESC, id DESC` (desempate de
     * eventos creados en el mismo tick de reloj).
     *
     * AVISO -- inconsistencia REAL detectada en `logSecurityEvent()` al
     * inventariar qué clave de `metadata` identifica al usuario objetivo
     * (pedido explícito de la tarea: documentarla, no ocultarla):
     *   - `metadata->target_user_id`: USER_INVITED, USER_UPDATED_BY_ADMIN,
     *     USER_ACTIVATED, USER_DEACTIVATED, INVITATION_RESENT,
     *     ROLE_ASSIGNED, ROLE_REVOKED, PASSWORD_RESET_BY_ADMIN.
     *   - `metadata->created_user_id`: USER_CREATED_BY_ADMIN -- ÚNICO
     *     evento con una clave DISTINTA para el mismo propósito (histórico,
     *     de `store()`, no se renombra en este lote para no romper
     *     auditoría ya persistida -- señalado para reconciliación futura).
     *   - columna `security_logs.user_id` (NO `metadata`): INVITATION_ACCEPTED
     *     -- `InvitationController::accept()` invoca `logSecurityEvent()`
     *     pasando al propio usuario que acepta como `$actor`, así que el
     *     usuario objetivo queda en la columna `user_id` del log, nunca en
     *     `metadata`. Se filtra con una rama OR aparte.
     *
     * AVISO -- guarda de aislamiento tipo "rol GLOBAL" (la que
     * `RoleController::activity()` sí necesitó, ver `isPlatformStaff()`):
     * NO aplica aquí. `User` no tiene equivalente de "usuario global" --
     * `User::isSameTenantAs()` ya compara `tenant_organization_id` exacto
     * INCLUYENDO NULL=NULL como "mismo grupo" (caso posible vía factory sin
     * override explícito de `tenant_organization_id`; `DatabaseSeeder` ya no
     * siembra ningún usuario con ese valor NULL desde 2026-07-16 -- ver
     * `PlatformAdminSeeder`), por lo que un actor con tenant real (id no
     * nulo) NUNCA hace match contra un usuario NULL ni viceversa. El mismo
     * chequeo manual de `show()`/`update()`/`activate()`/`deactivate()`
     * (`Gate::authorize('view', $user)` -> `UserPolicy::view()` ->
     * `isSameTenantAs()`) ya es SUFICIENTE por sí solo para este endpoint
     * -- verificado, no asumido.
     */
    public function activity(Request $request, User $user)
    {
        abort_unless($request->user()->hasPermission('audit.read'), 403, 'No tiene permiso para consultar la auditoría de usuarios.');

        if (! $request->user()->isSameTenantAs($user)) {
            throw ValidationException::withMessages([
                'user' => ['El usuario indicado no pertenece a tu organización.'],
            ]);
        }

        $targetUserIdEvents = [
            'USER_INVITED', 'USER_UPDATED_BY_ADMIN', 'USER_ACTIVATED', 'USER_DEACTIVATED',
            'INVITATION_RESENT', 'ROLE_ASSIGNED', 'ROLE_REVOKED', 'PASSWORD_RESET_BY_ADMIN',
        ];

        $logs = SecurityLog::query()
            ->where(function ($query) use ($user, $targetUserIdEvents) {
                $query->where(function ($query) use ($user, $targetUserIdEvents) {
                    $query->whereIn('event_type', $targetUserIdEvents)
                        ->where('metadata->target_user_id', $user->id);
                })->orWhere(function ($query) use ($user) {
                    $query->where('event_type', 'USER_CREATED_BY_ADMIN')
                        ->where('metadata->created_user_id', $user->id);
                })->orWhere(function ($query) use ($user) {
                    $query->where('event_type', 'INVITATION_ACCEPTED')
                        ->where('user_id', $user->id);
                });
            })
            ->with('user:id,username')
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
}
