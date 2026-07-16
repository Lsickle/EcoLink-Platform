<?php

namespace App\Http\Controllers\Concerns;

use App\Http\Controllers\Api\AuthController;
use App\Models\SecurityLog;
use App\Models\User;
use Illuminate\Http\Request;

/**
 * RN-038: todo cambio de permisos/roles/usuarios administrativo debe quedar
 * registrado. Mismo patrón de {@see AuthController::logSecurityEvent()},
 * extraído a un trait para reutilizarse entre los controladores Admin/*
 * sin duplicar código ni tocar AuthController (fuera de alcance de este
 * lote).
 */
trait LogsSecurityEvents
{
    private function logSecurityEvent(
        Request $request,
        string $eventType,
        string $result,
        string $description,
        ?User $actor = null,
        ?array $metadata = null,
    ): void {
        SecurityLog::query()->create([
            'tenant_organization_id' => $actor?->tenant_organization_id,
            'user_id' => $actor?->id,
            'person_id' => $actor?->person_id,
            'event_type' => $eventType,
            'result' => $result,
            'description' => $description,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'metadata' => $metadata,
            'risk_level' => $result === 'FAILURE' ? 'MEDIUM' : 'LOW',
        ]);
    }
}
