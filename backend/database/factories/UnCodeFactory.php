<?php

namespace Database\Factories;

use App\Models\UnCode;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<UnCode>
 */
class UnCodeFactory extends Factory
{
    protected $model = UnCode::class;

    public function definition(): array
    {
        return [
            'code' => strtoupper(fake()->unique()->lexify('UN????')),
            'name' => fake()->unique()->sentence(3),
            'hazard_class' => null,
            'packing_group' => null,
            'is_system' => false,
            'is_active' => true,
        ];
    }
}
