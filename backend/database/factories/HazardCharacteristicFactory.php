<?php

namespace Database\Factories;

use App\Models\HazardCharacteristic;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<HazardCharacteristic>
 */
class HazardCharacteristicFactory extends Factory
{
    protected $model = HazardCharacteristic::class;

    public function definition(): array
    {
        return [
            'code' => strtoupper(fake()->unique()->lexify('HAZ????')),
            'name' => fake()->unique()->word(),
            'risk_level' => fake()->numberBetween(1, 9),
            'description' => null,
            'is_system' => false,
            'is_active' => true,
        ];
    }
}
