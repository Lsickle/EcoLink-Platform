<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\LogsSecurityEvents;
use App\Http\Controllers\Controller;
use App\Models\PasswordHistory;
use App\Models\User;
use App\Models\UserInvitation;
use App\Models\UserStatus;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

/**
 * Mecanismo de invitación de usuarios (reemplaza el registro público de
 * AuthController::register(), eliminado -- CU-006.1 modificado): un usuario
 * nace `PENDING_ACTIVATION` (creado por un admin vía
 * UserManagementController::store(), o -- en la próxima tarea, fuera de
 * alcance aquí -- vía una solicitud de invitación aprobada) y activa su
 * propia cuenta aquí, fijando su contraseña real. Antes de esto, el
 * `password_hash` del usuario es un placeholder aleatorio inutilizable.
 *
 * `accept()` es público (sin `auth:sanctum`) -- mismo criterio que
 * PasswordRecoveryController: mensajes de error siempre genéricos, sin
 * revelar si el token "existió" vs "expiró" vs "ya fue usado" (evita
 * enumeración). Rate limiting dedicado `invitation-accept` (ver
 * AppServiceProvider::configureRateLimiting()).
 */
class InvitationController extends Controller
{
    use LogsSecurityEvents;

    private const GENERIC_ERROR_MESSAGE = 'Enlace de invitación inválido o expirado.';

    public function accept(Request $request)
    {
        $data = $request->validate([
            'token' => ['required', 'string'],
            'password' => ['required', 'confirmed', Password::min(8)->letters()->mixedCase()->numbers()],
        ]);

        $invitationRow = UserInvitation::findValidByPlainToken($data['token']);

        $user = $invitationRow ? User::query()->find($invitationRow->user_id) : null;

        if (! $invitationRow || ! $user) {
            $this->logSecurityEvent($request, 'INVITATION_ACCEPT_FAILED', 'FAILURE', 'Token de invitación inválido, expirado o ya utilizado.');

            throw ValidationException::withMessages(['token' => [self::GENERIC_ERROR_MESSAGE]]);
        }

        DB::transaction(function () use ($data, $user, $invitationRow) {
            $activeStatus = UserStatus::query()->where('code', 'ACTIVE')->firstOrFail();

            $user->forceFill([
                'password_hash' => $data['password'],
                'user_status_id' => $activeStatus->id,
            ])->save();

            PasswordHistory::query()->create([
                'user_id' => $user->id,
                'password_hash' => $user->password_hash,
            ]);

            // Uso único: la invitación ya no sirve tras un accept() exitoso.
            DB::table('user_invitations')->where('id', $invitationRow->id)->update([
                'accepted_at' => now(),
                'updated_at' => now(),
            ]);
        });

        $this->logSecurityEvent($request, 'INVITATION_ACCEPTED', 'SUCCESS', "Invitación aceptada, cuenta '{$user->username}' activada.", $user);

        // Sin login automático -- mismo criterio que el register() eliminado,
        // el usuario inicia sesión por separado con su contraseña nueva.
        return response()->json(['message' => 'Cuenta activada correctamente. Ya puedes iniciar sesión.']);
    }
}
