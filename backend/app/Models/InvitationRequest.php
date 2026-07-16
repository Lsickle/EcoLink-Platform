<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\InvitationRequestFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Mecanismo de "solicitud de invitación" (reemplaza el registro público
 * eliminado -- CU-006.1 modificado): cola de trabajo de solicitudes de
 * acceso público, revisadas por un ADMINISTRADOR (`users.create`) que las
 * aprueba (crea el usuario real + invitación, ver
 * InvitationRequestController::approve()) o las rechaza. Sin SoftDeletes a
 * propósito -- es historial de decisiones administrativas, se conserva
 * completo (a diferencia de `user_invitations`, transitoria).
 */
#[Fillable([
    'first_name', 'middle_name', 'last_name', 'second_last_name',
    'document_type', 'document_number', 'email', 'phone', 'status',
    'reviewed_by', 'reviewed_at', 'rejection_reason', 'resulting_user_id',
])]
class InvitationRequest extends Model
{
    /** @use HasFactory<InvitationRequestFactory> */
    use HasFactory, HasUuid;

    protected function casts(): array
    {
        return [
            'reviewed_at' => 'datetime',
        ];
    }

    public function reviewedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function resultingUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resulting_user_id');
    }
}
