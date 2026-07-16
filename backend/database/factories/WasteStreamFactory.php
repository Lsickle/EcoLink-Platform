<?php

namespace Database\Factories;

use App\Models\WasteStream;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<WasteStream>
 */
class WasteStreamFactory extends Factory
{
    protected $model = WasteStream::class;

    public function definition(): array
    {
        return [
            'code' => strtoupper(fake()->unique()->lexify('Y???')),
            'name' => fake()->unique()->sentence(4),
            'description' => null,
            'tipo' => fake()->randomElement(['Y', 'A']),
            'requires_manifest' => true,
            'requires_special_transport' => false,
            'is_system' => false,
            'is_active' => true,
        ];
    }
}
