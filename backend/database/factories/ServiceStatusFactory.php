<?php

namespace Database\Factories;

use App\Models\ServiceStatus;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ServiceStatus>
 */
class ServiceStatusFactory extends Factory
{
    protected $model = ServiceStatus::class;

    public function definition(): array
    {
        return [
            'organization_id' => null,
            'code' => strtoupper(fake()->unique()->lexify('STATUS_??????')),
            'name' => fake()->unique()->words(2, true),
            'description' => null,
            'sequence_order' => 1,
            'is_initial_status' => false,
            'is_terminal_status' => false,
            'is_system_status' => true,
            'blocks_editing' => false,
            'is_active' => true,
        ];
    }
}
