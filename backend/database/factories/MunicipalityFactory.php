<?php

namespace Database\Factories;

use App\Models\Department;
use App\Models\Municipality;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Municipality>
 */
class MunicipalityFactory extends Factory
{
    protected $model = Municipality::class;

    public function definition(): array
    {
        return [
            'department_id' => Department::factory(),
            'codigo_dane' => fake()->unique()->numerify('#####'),
            'name' => fake()->unique()->city(),
            'is_active' => true,
        ];
    }
}
