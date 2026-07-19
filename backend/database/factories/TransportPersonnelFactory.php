<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\Person;
use App\Models\TransportPersonnel;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<TransportPersonnel>
 */
class TransportPersonnelFactory extends Factory
{
    protected $model = TransportPersonnel::class;

    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'person_id' => Person::factory(),
            'license_number' => fake()->unique()->numerify('LIC-########'),
            'license_category' => fake()->randomElement(['B2', 'C1', 'C2', 'C3']),
            'license_expiration_date' => fake()->dateTimeBetween('+6 months', '+3 years'),
            'has_hazmat_permit' => false,
            'is_active' => true,
        ];
    }
}
