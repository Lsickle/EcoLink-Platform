<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\LogsSecurityEvents;
use App\Http\Controllers\Controller;
use App\Models\InvitationRequest;
use App\Models\Person;
use App\Models\User;
use App\Services\UserProvisioningService;
use Database\Seeders\PlatformOrganizationSeeder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

/**
 * Mecanismo de "solicitud de invitación" (reemplaza el registro público
 * eliminado de AuthController::register() -- CU-006.1 modificado, tarea 2 del
 * mecanismo de invitación): `store()` es el formulario público donde alguien
 * pide acceso (sin `password`, sin alta inmediata); un ADMINISTRADOR
 * (`users.create`) revisa la cola vía `index()` y decide `approve()` (crea el
 * usuario real reutilizando {@see UserProvisioningService::createPendingUser()}
 * -- MISMO patrón exacto que `UserManagementController::store()`) o
 * `reject()`.
 *
 * `store()` sigue el mismo principio anti-enumeración que CU-009
 * (PasswordRecoveryController): SIEMPRE responde el mismo mensaje genérico de
 * éxito, exista o no ya el correo/documento -- no se revela nada vía el
 * cuerpo de la respuesta ni vía errores de validación 422 de unicidad (por
 * eso `store()` NO usa reglas `unique:` de Laravel sobre email/documento,
 * solo formato). El intento se registra igual en `security_logs`
 * (`SUCCESS`/`DUPLICATE_IGNORED`), sin exponerlo al cliente.
 *
 * `reviewed_by`/`resulting_user_id` -- no confundir con `invited_by` de
 * `UserInvitation` (esa fila la crea internamente
 * `UserProvisioningService::createPendingUser()` vía
 * `UserInvitation::issueFor()`, con el mismo actor que aprueba aquí).
 *
 * Hallazgo Alto (especialista-seguridad, 2026-07-14): `invitation_requests`
 * es una cola global sin frontera de tenant -- cualquier admin con
 * `users.create` de cualquier organización podía ver/aprobar/rechazar
 * solicitudes de cualquier otra, exponiendo PII de terceros sin relación con
 * su tenant. El usuario del proyecto confirmó explícitamente (pregunta
 * directa, no reinterpretación propia): solo el staff de la organización
 * PLATAFORMA (`User::isPlatformStaff()`, `organizations.is_platform_tenant =
 * true`, D-CER-04) puede ver/aprobar/rechazar esta cola -- ningún admin de
 * una empresa cliente, aunque tenga `users.create`. `index()`, `approve()` y
 * `reject()` exigen ahora AMBOS: el permiso RBAC (`users.create`, mismo
 * permiso en los tres -- `index()` antes solo pedía `users.read`, se sube
 * porque el dato listado es PII cross-tenant igual que approve/reject) y
 * `isPlatformStaff()`. Requiere {@see PlatformOrganizationSeeder}
 * corrido (siembra la única fila `is_platform_tenant=true`) -- sin ella el
 * gate es insatisfacible por construcción.
 */
class InvitationRequestController extends Controller
{
    use LogsSecurityEvents;

    private const GENERIC_SUCCESS_MESSAGE = 'Tu solicitud fue enviada. Un administrador la revisará.';

    /**
     * Público, sin `auth:sanctum`. Rate limiting dedicado `invitation-request`
     * (ver AppServiceProvider::configureRateLimiting()), mismo criterio que
     * `invitation-accept`.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'first_name' => ['required', 'string', 'max:100'],
            'middle_name' => ['nullable', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'second_last_name' => ['nullable', 'string', 'max:100'],
            'document_type' => ['required', 'string', 'max:20'],
            'document_number' => ['required', 'string', 'max:50'],
            'email' => ['required', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
        ]);

        // Anti-enumeración (mismo principio que CU-009): NO se usan reglas
        // `unique:` de validación (revelarían con un 422 si el dato ya
        // existe) -- se verifica manualmente y, si ya existe, se ignora en
        // silencio sin crear la fila, pero respondiendo el mismo mensaje.
        $alreadyExists = Person::query()->where('document_number', $data['document_number'])->exists()
            || Person::query()->where('email', $data['email'])->exists()
            || User::query()->where('email', $data['email'])->exists()
            || InvitationRequest::query()->where('email', $data['email'])->where('status', 'PENDING')->exists();

        if ($alreadyExists) {
            $this->logSecurityEvent(
                $request,
                'INVITATION_REQUEST_SUBMITTED',
                'DUPLICATE_IGNORED',
                'Solicitud de invitación ignorada -- correo/documento ya en uso o solicitud pendiente existente.',
            );
        } else {
            InvitationRequest::query()->create($data + ['status' => 'PENDING']);

            $this->logSecurityEvent($request, 'INVITATION_REQUEST_SUBMITTED', 'SUCCESS', 'Solicitud de invitación registrada.');
        }

        return response()->json(['message' => self::GENERIC_SUCCESS_MESSAGE]);
    }

    /**
     * Gateado igual que `approve()`/`reject()` (`users.create` + gate de
     * plataforma, ver docblock de clase). `invitation_requests` no lleva
     * `tenant_organization_id` (es una cola PRE-tenant -- el solicitante
     * todavía no pertenece a ninguna organización), así que el único
     * aislamiento posible es restringir QUIÉN puede verla, no filtrarla por
     * tenant -- de ahí el gate de plataforma.
     */
    public function index(Request $request)
    {
        Gate::authorize('create', User::class);
        abort_unless($request->user()->isPlatformStaff(), 403, 'Solo el staff de la organización plataforma puede gestionar la cola de solicitudes de invitación.');

        $requests = InvitationRequest::query()
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->query('status')))
            ->latest('created_at')
            ->paginate($request->integer('per_page', 15));

        return response()->json($requests);
    }

    /**
     * Gateado igual que `UserManagementController::store()` (`users.create`)
     * más el gate de plataforma (ver docblock de clase). Crea el usuario real
     * reutilizando el MISMO patrón que `store()` (extraído a
     * `UserProvisioningService::createPendingUser()`).
     */
    public function approve(Request $request, InvitationRequest $invitationRequest)
    {
        Gate::authorize('create', User::class);
        abort_unless($request->user()->isPlatformStaff(), 403, 'Solo el staff de la organización plataforma puede gestionar la cola de solicitudes de invitación.');

        if ($invitationRequest->status !== 'PENDING') {
            throw ValidationException::withMessages([
                'invitation_request' => ['Esta solicitud ya fue revisada.'],
            ]);
        }

        $data = $request->validate([
            'organization_id' => ['nullable', 'integer', 'exists:organizations,id'],
            // RN-027 (CU-006.7): todo usuario debe tener al menos un rol.
            'role_ids' => ['required', 'array', 'min:1'],
            'role_ids.*' => ['integer', 'distinct', 'exists:roles,id'],
        ]);

        // Revalida unicidad justo antes de crear: el tiempo transcurrido
        // entre el envío de la solicitud y su aprobación pudo haber dejado
        // el correo/documento tomados por otro registro (otro usuario
        // creado directamente, u otra solicitud aprobada primero).
        if (
            Person::query()->where('document_number', $invitationRequest->document_number)->exists()
            || Person::query()->where('email', $invitationRequest->email)->exists()
            || User::query()->where('email', $invitationRequest->email)->exists()
        ) {
            throw ValidationException::withMessages([
                'invitation_request' => ['El correo o documento de esta solicitud ya está en uso por otro registro -- no se puede aprobar.'],
            ]);
        }

        $user = DB::transaction(function () use ($invitationRequest, $data, $request) {
            $user = UserProvisioningService::createPendingUser([
                'first_name' => $invitationRequest->first_name,
                'middle_name' => $invitationRequest->middle_name,
                'last_name' => $invitationRequest->last_name,
                'second_last_name' => $invitationRequest->second_last_name,
                'document_type' => $invitationRequest->document_type,
                'document_number' => $invitationRequest->document_number,
                'email' => $invitationRequest->email,
                'phone' => $invitationRequest->phone,
                'role_ids' => $data['role_ids'],
                'organization_id' => $data['organization_id'] ?? null,
            ], $request->user());

            $invitationRequest->forceFill([
                'status' => 'APPROVED',
                'reviewed_by' => $request->user()->id,
                'reviewed_at' => now(),
                'resulting_user_id' => $user->id,
            ])->save();

            return $user;
        });

        $this->logSecurityEvent(
            $request,
            'INVITATION_REQUEST_APPROVED',
            'SUCCESS',
            "Solicitud de invitación de '{$invitationRequest->email}' aprobada.",
            $request->user(),
            ['invitation_request_id' => $invitationRequest->id, 'resulting_user_id' => $user->id],
        );

        return response()->json([
            'user' => $user->fresh(['person', 'status', 'roles']),
            'invitation_request' => $invitationRequest->fresh(),
        ], 201);
    }

    /**
     * Gateado igual que `approve()` (`users.create` + gate de plataforma).
     * Sin notificación al solicitante -- deliberado, confirmado fuera de
     * alcance en el plan.
     */
    public function reject(Request $request, InvitationRequest $invitationRequest)
    {
        Gate::authorize('create', User::class);
        abort_unless($request->user()->isPlatformStaff(), 403, 'Solo el staff de la organización plataforma puede gestionar la cola de solicitudes de invitación.');

        if ($invitationRequest->status !== 'PENDING') {
            throw ValidationException::withMessages([
                'invitation_request' => ['Esta solicitud ya fue revisada.'],
            ]);
        }

        $data = $request->validate([
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        $invitationRequest->forceFill([
            'status' => 'REJECTED',
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
            'rejection_reason' => $data['reason'] ?? null,
        ])->save();

        $this->logSecurityEvent(
            $request,
            'INVITATION_REQUEST_REJECTED',
            'SUCCESS',
            "Solicitud de invitación de '{$invitationRequest->email}' rechazada.",
            $request->user(),
            ['invitation_request_id' => $invitationRequest->id],
        );

        return response()->json(['invitation_request' => $invitationRequest->fresh()]);
    }
}
