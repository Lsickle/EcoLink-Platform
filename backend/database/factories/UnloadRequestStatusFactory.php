<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\UnloadRequestStatus;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<UnloadRequestStatus>
 */
class UnloadRequestStatusFactory extends Factory
{
    protected $model = UnloadRequestStatus::class;

    public function definition(): array
    {
        return [
            'tenant_organization_id' => Organization::factory(),
            'code' => strtoupper(fake()->unique()->lexify('STATUS_????')),
            'name' => fake()->words(2, true),
            'sort_order' => 1,
            'is_initial' => false,
            'is_final' => false,
            'is_active' => true,
        ];
    }
}
