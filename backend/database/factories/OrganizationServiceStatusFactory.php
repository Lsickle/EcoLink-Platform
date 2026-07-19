<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\OrganizationServiceStatus;
use App\Models\ServiceStatus;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<OrganizationServiceStatus>
 */
class OrganizationServiceStatusFactory extends Factory
{
    protected $model = OrganizationServiceStatus::class;

    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'service_status_id' => ServiceStatus::factory(),
            'activated_by' => null,
            'activated_at' => now(),
            'is_active' => true,
        ];
    }
}
