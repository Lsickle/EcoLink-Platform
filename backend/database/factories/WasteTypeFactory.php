<?php

namespace Database\Factories;

use App\Models\WasteType;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<WasteType>
 */
class WasteTypeFactory extends Factory
{
    protected $model = WasteType::class;

    public function definition(): array
    {
        return [
            'code' => strtoupper(fake()->unique()->lexify('WTY????')),
            'name' => fake()->unique()->word(),
            'is_system' => false,
            'is_active' => true,
        ];
    }
}
