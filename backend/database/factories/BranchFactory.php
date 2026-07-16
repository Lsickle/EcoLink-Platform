<?php

namespace Database\Factories;

use App\Models\Branch;
use App\Models\BranchType;
use App\Models\Organization;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Branch>
 */
class BranchFactory extends Factory
{
    protected $model = Branch::class;

    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'branch_type_id' => BranchType::factory(),
            'code' => strtoupper(fake()->unique()->lexify('BRA_??????')),
            'name' => fake()->unique()->company().' - Sede',
            'status' => 'ACTIVE',
            'country_id' => null,
            'department_id' => null,
            'municipality_id' => null,
            'locality_id' => null,
            'address' => fake()->streetAddress(),
            'phone' => fake()->phoneNumber(),
            'email' => fake()->unique()->companyEmail(),
            'environmental_license' => null,
            'license_expiration_date' => null,
            'operational_capacity' => null,
            'observations' => null,
            'is_active' => true,
        ];
    }
}
