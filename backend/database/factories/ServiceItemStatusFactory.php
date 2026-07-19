<?php

namespace Database\Factories;

use App\Models\ServiceItemStatus;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ServiceItemStatus>
 */
class ServiceItemStatusFactory extends Factory
{
    protected $model = ServiceItemStatus::class;

    public function definition(): array
    {
        return [
            'code' => strtoupper(fake()->unique()->lexify('ITEM_STATUS_??????')),
            'name' => fake()->unique()->words(2, true),
            'description' => null,
            'is_system' => true,
            'is_active' => true,
        ];
    }
}
