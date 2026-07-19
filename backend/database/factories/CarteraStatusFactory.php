<?php

namespace Database\Factories;

use App\Models\CarteraStatus;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<CarteraStatus>
 */
class CarteraStatusFactory extends Factory
{
    protected $model = CarteraStatus::class;

    public function definition(): array
    {
        return [
            'code' => strtoupper(fake()->unique()->lexify('CARTERA_??????')),
            'name' => fake()->unique()->words(2, true),
            'description' => null,
            'blocks_new_requests' => false,
            'is_system' => true,
            'is_active' => true,
        ];
    }
}
