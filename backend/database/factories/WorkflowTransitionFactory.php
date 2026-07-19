<?php

namespace Database\Factories;

use App\Models\WorkflowTransition;
use App\Models\WorkflowVersion;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<WorkflowTransition>
 */
class WorkflowTransitionFactory extends Factory
{
    protected $model = WorkflowTransition::class;

    public function definition(): array
    {
        return [
            'workflow_version_id' => WorkflowVersion::factory(),
            'from_status_code' => strtoupper(fake()->unique()->lexify('FROM_??????')),
            'to_status_code' => strtoupper(fake()->unique()->lexify('TO_??????')),
            'is_automatic' => false,
            'requires_approval' => false,
        ];
    }
}
