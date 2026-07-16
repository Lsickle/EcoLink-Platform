<?php

namespace Database\Factories;

use App\Models\Locality;
use App\Models\Municipality;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Locality>
 */
class LocalityFactory extends Factory
{
    protected $model = Locality::class;

    public function definition(): array
    {
        return [
            'municipality_id' => Municipality::factory(),
            'code' => fake()->unique()->numerify('##'),
            'name' => fake()->unique()->streetName(),
            'is_active' => true,
        ];
    }
}
