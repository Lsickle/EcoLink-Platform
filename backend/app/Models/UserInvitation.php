<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use App\Notifications\UserInvitationNotification;
use Database\Factories\UserInvitationFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

// Mecanismo de invitación de usuarios (reemplaza el registro público de
// AuthController::register(), eliminado -- CU-006.1 modificado). Fila de
// estado TRANSITORIO gestionada por upsert() (ver issueFor()), no un
// catálogo -- sin SoftDeletes a propósito.
#[Fillable(['user_id', 'token_hash', 'invited_by', 'expires_at', 'accepted_at', 'resend_count'])]
class UserInvitation extends Model
{
    /** @use HasFactory<UserInvitationFactory> */
    use HasFactory, HasUuid;

    public const INVITATION_TTL_DAYS = 7;

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'accepted_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function invitedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invited_by');
    }

    /**
     * Punto único de reutilización para "emitir una invitación" -- usado por
     * UserManagementController::store() (invitación inicial al crear un
     * usuario) y UserManagementController::resendInvitation() (reenvío,
     * mismo método, la fila se reutiliza vía upsert). La SIGUIENTE tarea
     * (solicitudes de invitación, `invitation_requests`) debe invocar este
     * MISMO método al aprobar una solicitud -- ver firma abajo, no duplicar
     * esta lógica ahí.
     *
     * Firma estable: `UserInvitation::issueFor(User $user, ?User $invitedBy = null): string`
     * Devuelve el token en TEXTO PLANO (para que el llamador pueda usarlo
     * de inmediato si hace falta, p. ej. en tests) -- NUNCA se persiste así,
     * solo viaja por la notificación (ver UserInvitationNotification).
     *
     * `upsert()` (no `updateOrInsert()` -- mismo hallazgo de seguridad ya
     * corregido en PasswordRecoveryController::forgot(), no atómico) sobre
     * la UNIQUE(user_id): un reenvío reutiliza la MISMA fila en vez de
     * acumular filas por invitación. `uuid`/`resend_count`/`created_at` se
     * excluyen deliberadamente de las columnas a actualizar en conflicto --
     * de lo contrario cada reenvío resetearía `resend_count` a 0, que el
     * llamador (resendInvitation()) incrementa aparte tras esta llamada.
     */
    public static function issueFor(User $user, ?User $invitedBy = null): string
    {
        $token = Str::random(40);
        $expiresAt = now()->addDays(self::INVITATION_TTL_DAYS);

        DB::table('user_invitations')->upsert(
            [[
                'uuid' => (string) Str::uuid(),
                'user_id' => $user->id,
                'token_hash' => Hash::make($token),
                'invited_by' => $invitedBy?->id,
                'expires_at' => $expiresAt,
                'accepted_at' => null,
                'resend_count' => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]],
            ['user_id'],
            ['token_hash', 'invited_by', 'expires_at', 'accepted_at', 'updated_at'],
        );

        $user->notify(new UserInvitationNotification($token, $expiresAt));

        return $token;
    }

    /**
     * Busca la fila de invitación vigente (no expirada, no aceptada) cuyo
     * `token_hash` haga match con el token en texto plano recibido --
     * InvitationController::accept() no puede indexar por el token (está
     * hasheado, mismo criterio que password_reset_tokens), así que compara
     * contra el universo de invitaciones pendientes candidatas. Volumen
     * esperado bajo (invitaciones pendientes simultáneas por tenant), no se
     * optimiza con un lookup adicional no sensible -- documentado como
     * decisión de este lote, revisar si el volumen real lo justifica.
     */
    public static function findValidByPlainToken(string $token): ?object
    {
        return DB::table('user_invitations')
            ->whereNull('accepted_at')
            ->where('expires_at', '>', Carbon::now())
            ->get()
            ->first(fn (object $row): bool => Hash::check($token, $row->token_hash));
    }
}
