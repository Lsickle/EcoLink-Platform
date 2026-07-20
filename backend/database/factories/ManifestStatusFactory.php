<?php

namespace Database\Factories;

use App\Models\ManifestStatus;
use App\Models\Organization;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ManifestStatus>
 */
class ManifestStatusFactory extends Factory
{
    protected $model = ManifestStatus::class;

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
            'is_active' => true,
        ];
    }
}
