<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\OrganizationContact;
use App\Models\Person;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<OrganizationContact>
 */
class OrganizationContactFactory extends Factory
{
    protected $model = OrganizationContact::class;

    public function definition(): array
    {
        return [
            'contact_id' => fn () => Person::factory()->create()->id,
            'organization_id' => fn () => Organization::factory()->create()->id,
            'branch_id' => null,
            'position_title' => fake()->jobTitle(),
            'relationship_type' => 'Empleado',
            'is_primary' => false,
            'is_active' => true,
        ];
    }
}
