<?php

namespace Database\Factories;

use App\Models\BusinessRole;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<BusinessRole>
 */
class BusinessRoleFactory extends Factory
{
    protected $model = BusinessRole::class;

    public function definition(): array
    {
        return [
            'code' => strtoupper(fake()->unique()->lexify('BR_??????')),
            'name' => fake()->unique()->jobTitle(),
            'description' => fake()->sentence(),
            'can_generate_waste' => false,
            'can_transport_waste' => false,
            'can_treat_waste' => false,
            'can_approve_treatments' => false,
            'can_issue_manifests' => false,
            'can_issue_disposal_certificates' => false,
            'requires_environmental_license' => false,
            'requires_transport_authorization' => false,
            'sort_order' => 1,
            'is_system' => true,
            'is_active' => true,
        ];
    }
}
