<?php

namespace Database\Factories;

use App\Models\Role;
use App\Models\WorkflowTransition;
use App\Models\WorkflowTransitionRole;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<WorkflowTransitionRole>
 */
class WorkflowTransitionRoleFactory extends Factory
{
    protected $model = WorkflowTransitionRole::class;

    public function definition(): array
    {
        return [
            'workflow_transition_id' => WorkflowTransition::factory(),
            'role_id' => Role::factory(),
            'business_role_id' => null,
        ];
    }
}
