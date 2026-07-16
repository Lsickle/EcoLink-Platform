<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\OrganizationStatus;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Organization>
 */
class OrganizationFactory extends Factory
{
    protected $model = Organization::class;

    public function definition(): array
    {
        return [
            'legal_name' => fake()->unique()->company(),
            'tax_id' => fake()->unique()->numerify('9########'),
            'organization_status_id' => fn () => OrganizationStatus::factory()->create()->id,
        ];
    }
}
