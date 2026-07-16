<?php

namespace App\Console\Commands;

use App\Models\InvitationRequest;
use App\Models\SecurityLog;
use Illuminate\Console\Command;

/**
 * Retención de 90 días para solicitudes de invitación `REJECTED` (decisión
 * explícita del usuario del proyecto, revisión de seguridad del mecanismo de
 * invitación, 2026-07-14). `invitation_requests` NO tiene `SoftDeletes`
 * ({@see InvitationRequest}) -- es hard delete real, no un soft-delete
 * disfrazado.
 *
 * Se purga por `reviewed_at` (momento de la decisión de rechazo), no por
 * `created_at` -- es la fecha relevante para contar los 90 días de
 * retención de una solicitud YA resuelta. `PENDING`/`APPROVED` nunca se
 * tocan, sin importar su antigüedad.
 */
class PurgeRejectedInvitationsCommand extends Command
{
    private const RETENTION_DAYS = 90;

    protected $signature = 'invitations:purge-rejected';

    protected $description = 'Purga (hard delete) las solicitudes de invitación REJECTED con más de 90 días desde su revisión.';

    public function handle(): int
    {
        $purgedCount = InvitationRequest::query()
            ->where('status', 'REJECTED')
            ->where('reviewed_at', '<', now()->subDays(self::RETENTION_DAYS))
            ->delete();

        SecurityLog::query()->create([
            'event_type' => 'INVITATION_REQUESTS_PURGED',
            'result' => 'SUCCESS',
            'description' => 'Purga de solicitudes de invitación REJECTED con más de '.self::RETENTION_DAYS." días: {$purgedCount} fila(s) eliminada(s).",
            'risk_level' => 'LOW',
            'metadata' => ['purged_count' => $purgedCount],
        ]);

        $this->info("Purgadas {$purgedCount} solicitud(es) de invitación REJECTED con más de ".self::RETENTION_DAYS.' días.');

        return self::SUCCESS;
    }
}
