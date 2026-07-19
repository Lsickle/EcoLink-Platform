<?php

namespace Database\Factories;

use App\Models\Workflow;
use App\Models\WorkflowServiceBinding;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<WorkflowServiceBinding>
 */
class WorkflowServiceBindingFactory extends Factory
{
    protected $model = WorkflowServiceBinding::class;

    public function definition(): array
    {
        return [
            'workflow_id' => Workflow::factory(),
            'scope_type' => 'organization',
            'scope_id' => fake()->randomNumber(5),
        ];
    }
}
