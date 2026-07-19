<?php

namespace Database\Factories;

use App\Models\WorkflowLog;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<WorkflowLog>
 */
class WorkflowLogFactory extends Factory
{
    protected $model = WorkflowLog::class;

    public function definition(): array
    {
        return [
            'traceability_uuid' => (string) Str::uuid(),
            'tenant_organization_id' => null,
            'user_id' => null,
            'branch_id' => null,
            'process_type' => 'TREATMENT',
            'process_id' => fake()->randomNumber(5),
            'event_code' => 'STATUS_CHANGED',
            'event_name' => 'Cambio de estado',
            'description' => null,
            'previous_status' => null,
            'new_status' => null,
            'related_entity' => null,
            'related_entity_id' => null,
            'severity' => 'INFO',
            'source' => 'APPLICATION',
            'correlation_id' => null,
            'occurred_at' => now(),
        ];
    }
}
