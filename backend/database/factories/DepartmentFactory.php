<?php

namespace Database\Factories;

use App\Models\Country;
use App\Models\Department;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Department>
 */
class DepartmentFactory extends Factory
{
    protected $model = Department::class;

    public function definition(): array
    {
        return [
            'country_id' => Country::factory(),
            'dane_code' => fake()->unique()->numerify('##'),
            'name' => fake()->unique()->state(),
            'is_active' => true,
        ];
    }
}
