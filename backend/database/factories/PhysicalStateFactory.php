<?php

namespace Database\Factories;

use App\Models\PhysicalState;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PhysicalState>
 */
class PhysicalStateFactory extends Factory
{
    protected $model = PhysicalState::class;

    public function definition(): array
    {
        return [
            'code' => strtoupper(fake()->unique()->lexify('PHY????')),
            'name' => fake()->unique()->word(),
            'is_system' => false,
            'is_active' => true,
        ];
    }
}
