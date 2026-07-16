<?php

namespace Database\Factories;

use App\Models\PackagingCondition;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PackagingCondition>
 */
class PackagingConditionFactory extends Factory
{
    protected $model = PackagingCondition::class;

    public function definition(): array
    {
        return [
            'code' => strtoupper(fake()->unique()->lexify('PKC????')),
            'name' => fake()->unique()->word(),
            'risk_level' => fake()->numberBetween(1, 9),
            'is_system' => false,
            'is_active' => true,
        ];
    }
}
