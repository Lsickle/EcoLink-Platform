<?php

namespace App\Models;

use Database\Factories\WorkflowTransitionRoleFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

// esquema-bd (item 17/D-WF-01): workflow_transition_roles -- quién puede
// ejecutar una transición. Exactamente uno de `role_id`/`business_role_id`
// es no-nulo (CHECK de BD, ver migración).
#[Fillable(['workflow_transition_id', 'role_id', 'business_role_id'])]
class WorkflowTransitionRole extends Model
{
    /** @use HasFactory<WorkflowTransitionRoleFactory> */
    use HasFactory;

    public $timestamps = false;

    public function workflowTransition(): BelongsTo
    {
        return $this->belongsTo(WorkflowTransition::class);
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    public function businessRole(): BelongsTo
    {
        return $this->belongsTo(BusinessRole::class);
    }
}
