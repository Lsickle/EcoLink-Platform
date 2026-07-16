<?php

namespace Database\Factories;

use App\Models\WasteCategory;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<WasteCategory>
 */
class WasteCategoryFactory extends Factory
{
    protected $model = WasteCategory::class;

    public function definition(): array
    {
        return [
            'code' => strtoupper(fake()->unique()->lexify('CAT????')),
            'name' => fake()->unique()->word(),
            'description' => null,
            'is_system' => false,
            'is_active' => true,
        ];
    }
}
