<?php

namespace Database\Factories;

use App\Models\VehicleType;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<VehicleType>
 */
class VehicleTypeFactory extends Factory
{
    protected $model = VehicleType::class;

    public function definition(): array
    {
        return [
            'code' => strtoupper(fake()->unique()->lexify('VEH????')),
            'name' => fake()->unique()->word(),
            'category' => null,
            'is_system' => false,
            'is_active' => true,
        ];
    }
}
