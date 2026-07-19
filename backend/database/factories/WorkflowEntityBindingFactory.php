<?php

namespace Database\Factories;

use App\Models\Workflow;
use App\Models\WorkflowEntityBinding;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<WorkflowEntityBinding>
 */
class WorkflowEntityBindingFactory extends Factory
{
    protected $model = WorkflowEntityBinding::class;

    public function definition(): array
    {
        return [
            'workflow_id' => Workflow::factory(),
            'entity_table' => 'waste_treatment_approvals',
            'status_catalog_table' => 'respel_statuses',
            'status_column' => 'technical_status_id',
        ];
    }
}
