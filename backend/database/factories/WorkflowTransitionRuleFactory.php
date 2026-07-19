<?php

namespace Database\Factories;

use App\Models\WorkflowTransition;
use App\Models\WorkflowTransitionRule;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<WorkflowTransitionRule>
 */
class WorkflowTransitionRuleFactory extends Factory
{
    protected $model = WorkflowTransitionRule::class;

    public function definition(): array
    {
        return [
            'workflow_transition_id' => WorkflowTransition::factory(),
            'rule_type' => 'FIELD_REQUIRED',
            'rule_definition' => [],
            'error_message' => null,
        ];
    }
}
