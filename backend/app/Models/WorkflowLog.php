<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\WorkflowLogFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

// esquema-bd: workflow_logs -- registro cronológico de eventos operativos
// del motor de Workflow. `process_type`/`process_id` identifican la
// entidad PRINCIPAL que transiciona; `related_entity`/`related_entity_id`
// una entidad secundaria opcional (roles distintos, no redundantes,
// D-WF-04). Sin `updated_at` -- es un log append-only.
#[Fillable([
    'traceability_uuid', 'tenant_organization_id', 'user_id', 'branch_id',
    'process_type', 'process_id', 'event_code', 'event_name', 'description',
    'previous_status', 'new_status', 'related_entity', 'related_entity_id',
    'severity', 'source', 'metadata', 'correlation_id', 'occurred_at',
])]
class WorkflowLog extends Model
{
    /** @use HasFactory<WorkflowLogFactory> */
    use HasFactory, HasUuid;

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

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }
}
