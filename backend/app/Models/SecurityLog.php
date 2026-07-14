<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

// esquema-bd: security_logs. RN-034/RN-035: toda autenticación exitosa o
// fallida debe registrarse en auditoría -- registro append-only, sin
// updated_at (mismo patrón que audit_logs/workflow_logs/document_logs:
// solo `occurred_at`).
//
// AVISO -- el catálogo exacto de valores permitidos para `event_type` no
// está confirmado en esquema-bd ni en el resto de fuentes disponibles (solo
// se documenta que existe un catálogo, con un ejemplo suelto:
// WORKFLOW_TRANSITION_DENIED). Los valores usados aquí (LOGIN_SUCCESS,
// LOGIN_FAILED, LOGOUT, PASSWORD_CHANGED) son una convención razonable de
// este lote, no un catálogo validado con negocio -- señalado también en el
// resumen entregado al hilo principal.
#[Fillable([
    'tenant_organization_id', 'user_id', 'person_id', 'event_type', 'result',
    'description', 'ip_address', 'user_agent', 'device_fingerprint', 'country',
    'city', 'session_id', 'resource_url', 'request_method', 'correlation_id',
    'metadata', 'risk_level',
])]
class SecurityLog extends Model
{
    use HasUuid;

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'metadata' => 'array',
            'occurred_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $log) {
            $log->occurred_at ??= now();
        });
    }

    public function tenantOrganization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'tenant_organization_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function person(): BelongsTo
    {
        return $this->belongsTo(Person::class);
    }
}
