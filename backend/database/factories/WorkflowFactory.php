<?php

namespace Database\Factories;

use App\Models\Workflow;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Workflow>
 */
class WorkflowFactory extends Factory
{
    protected $model = Workflow::class;

    public function definition(): array
    {
        return [
            'tenant_organization_id' => null,
            'code' => strtoupper(fake()->unique()->lexify('WF_??????')),
            'name' => fake()->unique()->words(3, true),
            'description' => null,
            'entity_type' => 'TREATMENT',
            'is_system' => true,
            'is_active' => true,
        ];
    }
}
