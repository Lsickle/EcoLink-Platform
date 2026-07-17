<?php

namespace Database\Factories;

use App\Models\MeasurementUnit;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<MeasurementUnit>
 */
class MeasurementUnitFactory extends Factory
{
    protected $model = MeasurementUnit::class;

    public function definition(): array
    {
        return [
            'code' => strtoupper(fake()->unique()->lexify('MSU????')),
            'name' => fake()->unique()->word(),
            'is_system' => false,
            'is_active' => true,
        ];
    }
}
