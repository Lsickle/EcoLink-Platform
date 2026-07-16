<?php

namespace Database\Factories;

use App\Models\BusinessRole;
use App\Models\Organization;
use App\Models\OrganizationBusinessRole;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<OrganizationBusinessRole>
 */
class OrganizationBusinessRoleFactory extends Factory
{
    protected $model = OrganizationBusinessRole::class;

    public function definition(): array
    {
        return [
            'organization_id' => fn () => Organization::factory()->create()->id,
            'business_role_id' => fn () => BusinessRole::factory()->create()->id,
            'assigned_at' => now(),
            'is_active' => true,
        ];
    }
}
