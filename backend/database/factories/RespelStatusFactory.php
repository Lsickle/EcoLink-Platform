<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\RespelStatus;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<RespelStatus>
 */
class RespelStatusFactory extends Factory
{
    protected $model = RespelStatus::class;

    public function definition(): array
    {
        return [
            'tenant_organization_id' => Organization::factory(),
            'code' => strtoupper(fake()->unique()->lexify('STATUS_??????')),
            'name' => fake()->unique()->words(2, true),
            'description' => null,
            'sort_order' => 1,
            'is_initial' => false,
            'is_final' => false,
            'is_approved_status' => false,
            'is_rejected_status' => false,
            'requires_commercial_review' => false,
            'requires_environmental_review' => false,
            'allows_service_request' => false,
            'requires_additional_information' => false,
            'is_active' => true,
        ];
    }
}
