<?php

namespace App\Models;

use Database\Factories\WorkflowTransitionRuleFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

// esquema-bd (item 17/D-WF-01): workflow_transition_rules -- validaciones
// adicionales que debe cumplir una transición antes de ejecutarse. Sin
// filas sembradas en este lote (ver docblock de WorkflowSeeder).
#[Fillable(['workflow_transition_id', 'rule_type', 'rule_definition', 'error_message'])]
class WorkflowTransitionRule extends Model
{
    /** @use HasFactory<WorkflowTransitionRuleFactory> */
    use HasFactory;

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'rule_definition' => 'array',
        ];
    }

    public function workflowTransition(): BelongsTo
    {
        return $this->belongsTo(WorkflowTransition::class);
    }
}
