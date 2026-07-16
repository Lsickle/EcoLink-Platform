<?php

namespace Database\Factories;

use App\Models\OrganizationStatus;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<OrganizationStatus>
 */
class OrganizationStatusFactory extends Factory
{
    protected $model = OrganizationStatus::class;

    public function definition(): array
    {
        return [
            'code' => strtoupper(fake()->unique()->lexify('ORG_STATUS_??????')),
            'name' => fake()->unique()->words(2, true),
            'is_active' => true,
        ];
    }
}
