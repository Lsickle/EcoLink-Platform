<?php

namespace Database\Factories;

use App\Models\GenerationFrequency;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<GenerationFrequency>
 */
class GenerationFrequencyFactory extends Factory
{
    protected $model = GenerationFrequency::class;

    public function definition(): array
    {
        return [
            'code' => strtoupper(fake()->unique()->lexify('GFR????')),
            'name' => fake()->unique()->word(),
            'is_system' => false,
            'is_active' => true,
        ];
    }
}
