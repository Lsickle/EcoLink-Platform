<?php

namespace Database\Factories;

use App\Models\WasteOperationalStatus;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<WasteOperationalStatus>
 */
class WasteOperationalStatusFactory extends Factory
{
    protected $model = WasteOperationalStatus::class;

    public function definition(): array
    {
        return [
            'code' => strtoupper(fake()->unique()->lexify('WOS????')),
            'name' => fake()->unique()->word(),
            'is_system' => false,
            'is_active' => true,
        ];
    }
}
