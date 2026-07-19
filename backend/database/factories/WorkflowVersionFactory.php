<?php

namespace Database\Factories;

use App\Models\Workflow;
use App\Models\WorkflowVersion;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<WorkflowVersion>
 */
class WorkflowVersionFactory extends Factory
{
    protected $model = WorkflowVersion::class;

    public function definition(): array
    {
        return [
            'workflow_id' => Workflow::factory(),
            'version_number' => 1,
            'status' => 'DRAFT',
            'published_at' => null,
        ];
    }

    public function published(): static
    {
        return $this->state(fn () => [
            'status' => 'PUBLISHED',
            'published_at' => now(),
        ]);
    }
}
