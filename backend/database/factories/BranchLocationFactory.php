<?php

namespace Database\Factories;

use App\Models\Branch;
use App\Models\BranchLocation;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<BranchLocation>
 */
class BranchLocationFactory extends Factory
{
    protected $model = BranchLocation::class;

    public function definition(): array
    {
        return [
            'branch_id' => Branch::factory(),
            'code' => strtoupper(fake()->unique()->lexify('DOCK-???')),
            'name' => 'Muelle '.fake()->numberBetween(1, 20),
            'is_active' => true,
        ];
    }
}
