<?php

namespace Database\Factories;

use App\Models\PackagingType;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PackagingType>
 */
class PackagingTypeFactory extends Factory
{
    protected $model = PackagingType::class;

    public function definition(): array
    {
        return [
            'code' => strtoupper(fake()->unique()->lexify('PKG????')),
            'name' => fake()->unique()->word(),
            'is_system' => false,
            'is_active' => true,
        ];
    }
}
