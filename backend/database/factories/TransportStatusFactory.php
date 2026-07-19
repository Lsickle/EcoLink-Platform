<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\TransportStatus;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<TransportStatus>
 */
class TransportStatusFactory extends Factory
{
    protected $model = TransportStatus::class;

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
            'requires_schedule' => false,
            'requires_vehicle' => false,
            'requires_load_manifest' => false,
            'requires_unload_manifest' => false,
            'is_active' => true,
        ];
    }
}
