<?php

namespace Database\Factories;

use App\Models\Branch;
use App\Models\BranchTreatment;
use App\Models\Organization;
use App\Models\Treatment;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<BranchTreatment>
 */
class BranchTreatmentFactory extends Factory
{
    protected $model = BranchTreatment::class;

    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'branch_id' => Branch::factory(),
            'treatment_id' => Treatment::factory(),
            'internal_code' => null,
            'operational_name' => null,
            'max_capacity' => fake()->randomFloat(2, 100, 10000),
            'capacity_unit' => 'KG',
            'daily_capacity' => null,
            'monthly_capacity' => null,
            'environmental_license_number' => null,
            'valid_from' => null,
            'valid_until' => null,
            'requires_manual_approval' => false,
            'allows_mixed_waste' => false,
            'requires_weight_validation' => true,
            'operational_status' => 'ACTIVE',
            'observations' => null,
            'is_active' => true,
        ];
    }
}
