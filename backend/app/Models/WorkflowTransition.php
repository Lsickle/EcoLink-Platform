<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\WorkflowTransitionFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

// esquema-bd (item 17/D-WF-01): workflow_transitions -- por CÓDIGO
// (`from_status_code`/`to_status_code`), no por ID (ver docblock de la
// migración).
#[Fillable([
    'workflow_version_id', 'from_status_code', 'to_status_code', 'is_automatic', 'requires_approval',
])]
class WorkflowTransition extends Model
{
    /** @use HasFactory<WorkflowTransitionFactory> */
    use HasFactory, HasUuid;

    public const UPDATED_AT = null;

    protected function casts(): array
    {
        return [
            'is_automatic' => 'boolean',
            'requires_approval' => 'boolean',
        ];
    }

    public function workflowVersion(): BelongsTo
    {
        return $this->belongsTo(WorkflowVersion::class);
    }

    public function roles(): HasMany
    {
        return $this->hasMany(WorkflowTransitionRole::class);
    }

    public function rules(): HasMany
    {
        return $this->hasMany(WorkflowTransitionRule::class);
    }

    /**
     * Resuelve `from_status_code`/`to_status_code` (strings crudos) a su
     * fila completa de `respel_statuses` -- gap real encontrado por el
     * agente de frontend (CU-021): sin esto, el frontend solo tenía el
     * código, no el nombre/orden/color/flags necesarios para renderizar el
     * selector de transiciones. `belongsTo(..., 'from_status_code'/
     * 'to_status_code', 'code')` en vez de `id` -- mismo criterio ya usado
     * por `WorkflowController::validateTransitionPayload()`
     * (`Rule::exists('respel_statuses', 'code')`, sin filtro de tenant):
     * `respel_statuses.code` no es único globalmente en el esquema, pero
     * hoy TODAS las filas viven bajo el tenant PLATAFORMA (ver
     * `RespelStatusSeeder`), así que la ambigüedad es solo teórica.
     */
    public function fromStatus(): BelongsTo
    {
        return $this->belongsTo(RespelStatus::class, 'from_status_code', 'code');
    }

    public function toStatus(): BelongsTo
    {
        return $this->belongsTo(RespelStatus::class, 'to_status_code', 'code');
    }
}
