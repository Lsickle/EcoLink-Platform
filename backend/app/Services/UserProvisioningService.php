<?php

namespace App\Services;

use App\Models\PasswordHistory;
use App\Models\Person;
use App\Models\Role;
use App\Models\User;
use App\Models\UserInvitation;
use App\Models\UserRole;
use App\Models\UserStatus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Punto único de reutilización para "crear un usuario que nace
 * PENDING_ACTIVATION + emitir su invitación" -- extraído del bloque que
 * antes vivía inline en `UserManagementController::store()` (tarea 1 del
 * mecanismo de invitación) para que la tarea 2 (aprobación de solicitudes de
 * invitación, `InvitationRequestController::approve()`) reutilice EXACTAMENTE
 * el mismo patrón (Person+User+PasswordHistory+roles+UserInvitation::issueFor()
 * dentro de una transacción) en vez de duplicarlo de forma inconsistente.
 *
 * `tenant_organization_id` se toma de `$actor` (el usuario autenticado que
 * ejecuta la creación), nunca directamente de `$data` -- mismo hallazgo de
 * seguridad ya corregido en `store()` (evita que un admin cree usuarios
 * "fantasma" bajo el tenant de otra organización). ÚNICA excepción (gap de
 * staging 2026-08-08, alta del primer administrador de una organización
 * cliente nueva): cuando `$actor->isPlatformStaff()` es `true` Y
 * `$data['organization_id']` viene informado, ESE valor se usa como
 * `tenant_organization_id` del usuario nuevo -- solo el staff de la
 * organización Plataforma (EcoLink) puede "sembrar" el tenant de otra
 * organización, nunca un admin de tenant normal. Ver
 * `resolveTenantOrganizationId()`.
 *
 * AVISO -- desviación explícita de criterio propio, no confirmada con
 * negocio: `store()` exige `username` como input obligatorio del admin (no
 * está en el listado de "Datos de Entrada" de CU-006.1, pero es NOT NULL
 * UNIQUE en el esquema real). La solicitud de invitación pública (tarea 2)
 * NO pide `username` -- el formulario público solo captura los datos de la
 * persona, sin que el solicitante elija su propio nombre de usuario. Para no
 * bloquear la aprobación en un campo que ninguna spec fuente pide en ese
 * formulario, `username` se AUTO-GENERA a partir del correo cuando no se
 * provee explícitamente (ver `generateUniqueUsername()`), con sufijo
 * numérico si colisiona. Señalado para que el hilo principal confirme si el
 * negocio prefiere que el admin lo escriba a mano al aprobar.
 */
class UserProvisioningService
{
    /**
     * @param  array{first_name: string, middle_name?: ?string, last_name: string, second_last_name?: ?string, document_type: string, document_number: string, email: string, phone?: ?string, username?: ?string, role_ids: array<int, int>, organization_id?: ?int}  $data
     */
    public static function createPendingUser(array $data, User $actor): User
    {
        return DB::transaction(function () use ($data, $actor) {
            // Hallazgo Crítico (especialista-seguridad, 2026-07-14):
            // `role_ids.*` solo se validaba con `exists:roles,id`
            // (existencia global) en los controllers que llaman a este
            // servicio -- sin comprobar `Role::isAccessibleBy($actor)`. Un
            // admin de un tenant podía crear un usuario en su propio tenant
            // y asignarle un rol personalizado de OTRO tenant (conociendo o
            // adivinando su id), obteniendo permisos efectivos de una
            // organización ajena ("role smuggling" cross-tenant). Mismo
            // patrón ya corregido en `RoleController::assignToUser()` (ver
            // `Role::isAccessibleBy()`) -- se valida aquí, en el servicio
            // compartido, para proteger automáticamente tanto `store()`
            // como `approve()` sin duplicar el chequeo en los dos
            // controllers.
            self::assertRolesAccessibleBy($data['role_ids'], $actor);

            $person = Person::query()->create([
                'document_type' => $data['document_type'],
                'document_number' => $data['document_number'],
                'first_name' => $data['first_name'],
                'middle_name' => $data['middle_name'] ?? null,
                'last_name' => $data['last_name'],
                'second_last_name' => $data['second_last_name'] ?? null,
                'email' => $data['email'],
                'phone' => $data['phone'] ?? null,
            ]);

            // Mecanismo de invitación: el usuario SIEMPRE nace
            // PENDING_ACTIVATION. `password_hash` es un placeholder
            // aleatorio, NUNCA comunicado -- inutilizable hasta que se
            // acepte la invitación (ver UserInvitation::issueFor()).
            $pendingStatus = UserStatus::query()->where('code', 'PENDING_ACTIVATION')->firstOrFail();

            $user = User::query()->create([
                // Hallazgo Crítico (ver UserManagementController): del actor
                // autenticado por defecto, nunca de un input del cliente sin
                // control -- salvo la excepción de platform staff, ver
                // resolveTenantOrganizationId() y el docblock de clase.
                'tenant_organization_id' => self::resolveTenantOrganizationId($data, $actor),
                'organization_id' => $data['organization_id'] ?? null,
                'person_id' => $person->id,
                'username' => $data['username'] ?? self::generateUniqueUsername($data['email']),
                'email' => $data['email'],
                'password_hash' => Str::random(64),
                'user_status_id' => $pendingStatus->id,
                // esquema-bd: users.created_by/updated_by (auditoría
                // estándar) -- mismo criterio que RoleController::store(),
                // resuelto por UserManagementController::show() a
                // {id, username} vía User::createdBy()/updatedBy().
                'created_by' => $actor->id,
                'updated_by' => $actor->id,
            ]);

            PasswordHistory::query()->create([
                'user_id' => $user->id,
                'password_hash' => $user->password_hash,
            ]);

            // RN-027/CU-006.7: todo usuario debe tener al menos un rol.
            foreach (array_unique($data['role_ids']) as $roleId) {
                UserRole::query()->create([
                    'user_id' => $user->id,
                    'role_id' => $roleId,
                    'assigned_by' => $actor->id,
                    'assigned_at' => now(),
                    'is_active' => true,
                ]);
            }

            UserInvitation::issueFor($user, $actor);

            return $user;
        });
    }

    /**
     * Crea el usuario ADMINISTRADOR de una organización Generador dada de
     * alta por Carga Masiva (confirmado por el usuario, 2026-08-11) -- a
     * diferencia de `createPendingUser()`, nace `ACTIVE` de una, CON
     * contraseña real conocida (nunca persistida en claro fuera del valor de
     * retorno de este método), SIN invitación por correo. Mismo criterio que
     * `CreateAdminCommand` (`user:create-admin`), pero parametrizable a
     * CUALQUIER organización -- ese comando de consola solo sirve para el
     * bootstrap de la organización PLATAFORMA.
     *
     * `email` nace con un placeholder único no funcional (`{username}@sin-correo.invalid`,
     * TLD `.invalid` reservado por RFC 2606 para direcciones no
     * enrutables) -- el esquema exige `email` NOT NULL UNIQUE y hoy no existe
     * ningún mecanismo de "sin correo" real; el Generador puede loguearse de
     * inmediato con `username`+esta contraseña (`AuthController::login()` ya
     * acepta ambos). Reservado a `GeneratorBulkImportService` -- el llamador
     * es responsable de la autorización (ver `GeneratorBulkImportController`).
     *
     * @return array{user: User, temporary_password: string}
     */
    public static function createActiveAdminForOrganization(int $organizationId, string $legalName, ?string $username, User $actor): array
    {
        return DB::transaction(function () use ($organizationId, $legalName, $username, $actor) {
            $activeStatus = UserStatus::query()->where('code', 'ACTIVE')->firstOrFail();
            $role = Role::query()->where('code', 'ADMINISTRADOR')->firstOrFail();
            $password = Str::password(16);
            $resolvedUsername = $username !== null && $username !== ''
                ? self::assertUsernameAvailable($username)
                : self::generateUniqueUsernameFromSeed($legalName);
            $placeholderEmail = "{$resolvedUsername}@sin-correo.invalid";

            $person = Person::query()->create([
                'document_type' => 'CC',
                'document_number' => 'GEN-'.Str::upper(Str::random(10)),
                'first_name' => 'Administrador',
                'last_name' => Str::limit($legalName, 95, ''),
                'email' => $placeholderEmail,
            ]);

            $user = User::query()->create([
                'tenant_organization_id' => $organizationId,
                'organization_id' => $organizationId,
                'person_id' => $person->id,
                'username' => $resolvedUsername,
                'email' => $placeholderEmail,
                'password_hash' => $password,
                'user_status_id' => $activeStatus->id,
                // Cambio de contraseña obligatorio en el primer login
                // (confirmado por el usuario, 2026-08-11 -- hallazgo Alto de
                // la revisión de seguridad de este mismo flujo): quien
                // ejecuta la carga masiva conoce esta contraseña temporal;
                // el Generador debe cambiarla antes de poder usar el resto
                // de la aplicación. Ver `EnsureUserIsActive` (bloquea el
                // resto de la API mientras el flag siga en true) y
                // `AuthController::changePassword()` (lo limpia al éxito).
                'must_change_password' => true,
                'created_by' => $actor->id,
                'updated_by' => $actor->id,
            ]);

            PasswordHistory::query()->create([
                'user_id' => $user->id,
                'password_hash' => $user->password_hash,
            ]);

            UserRole::query()->create([
                'user_id' => $user->id,
                'role_id' => $role->id,
                'assigned_by' => $actor->id,
                'assigned_at' => now(),
                'is_active' => true,
            ]);

            return ['user' => $user, 'temporary_password' => $password];
        });
    }

    /**
     * Valida que un `username` explícito (columna opcional del CSV de Carga
     * Masiva) no colisione -- a diferencia de `generateUniqueUsernameFromSeed()`,
     * NO le agrega sufijo: si el CSV pide un username puntual y ya está
     * tomado, es un error de fila (se reporta en `GeneratorBulkImportService`),
     * no una sustitución silenciosa.
     */
    private static function assertUsernameAvailable(string $username): string
    {
        if (User::query()->where('username', $username)->exists()) {
            throw ValidationException::withMessages([
                'username' => ["El nombre de usuario '{$username}' ya está en uso."],
            ]);
        }

        return $username;
    }

    /**
     * Resuelve el `tenant_organization_id` del usuario nuevo (ver docblock
     * de clase). Por defecto, siempre el tenant del actor -- el único
     * desvío permitido es platform staff (`User::isPlatformStaff()`)
     * enviando `organization_id` explícito, caso reservado a sembrar el
     * primer usuario administrador de una organización cliente nueva. Un
     * admin de tenant normal NUNCA llega a esta rama aunque envíe
     * `organization_id` -- el hallazgo Crítico de aislamiento
     * (especialista-seguridad, 2026-07-13) sigue cerrado sin excepción para
     * ese caso.
     */
    private static function resolveTenantOrganizationId(array $data, User $actor): ?int
    {
        if ($actor->isPlatformStaff() && ($data['organization_id'] ?? null) !== null) {
            return (int) $data['organization_id'];
        }

        return $actor->tenant_organization_id;
    }

    /**
     * Hallazgo Crítico (especialista-seguridad, 2026-07-14): rechaza TODA
     * la operación (422) si CUALQUIERA de los `role_ids` recibidos no es
     * accesible por el actor (`Role::isAccessibleBy()` -- global o del
     * mismo tenant). `whereIn` tolera ids ya inexistentes sin fallar aquí
     * porque `store()`/`approve()` ya los validan con `exists:roles,id`
     * antes de llegar a este servicio -- este método solo cierra el hueco
     * de aislamiento cross-tenant, no la existencia.
     */
    private static function assertRolesAccessibleBy(array $roleIds, User $actor): void
    {
        $roles = Role::query()->whereIn('id', array_unique($roleIds))->get();

        foreach ($roles as $role) {
            if (! $role->isAccessibleBy($actor)) {
                throw ValidationException::withMessages([
                    'role_ids' => ["El rol '{$role->name}' no pertenece a tu organización."],
                ]);
            }
        }
    }

    /**
     * Deriva un `username` único a partir de la parte local del correo (ver
     * aviso de clase). No colisiona con `users.username` (UNIQUE) --
     * intenta el slug base y agrega un sufijo numérico creciente.
     */
    private static function generateUniqueUsername(string $email): string
    {
        return self::generateUniqueUsernameFromSeed(Str::before($email, '@'));
    }

    /**
     * Misma lógica de `generateUniqueUsername()` pero seedable desde
     * cualquier texto (no solo la parte local de un correo) -- usada por
     * `createActiveAdminForOrganization()` con la razón social del
     * Generador, ya que esos usuarios no tienen un correo real de origen.
     */
    private static function generateUniqueUsernameFromSeed(string $seed): string
    {
        $base = Str::slug($seed, '.') ?: 'usuario';
        $candidate = $base;
        $suffix = 1;

        while (User::query()->where('username', $candidate)->exists()) {
            $candidate = $base.'.'.$suffix;
            $suffix++;
        }

        return $candidate;
    }
}
