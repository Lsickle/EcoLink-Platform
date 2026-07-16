<?php

namespace Database\Factories;

use App\Models\BranchType;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<BranchType>
 */
class BranchTypeFactory extends Factory
{
    protected $model = BranchType::class;

    public function definition(): array
    {
        return [
            'code' => strtoupper(fake()->unique()->lexify('BT_??????')),
            'name' => fake()->unique()->jobTitle(),
            'category' => 'Operativa',
            'is_logistics' => false,
            'is_storage' => false,
            'is_treatment' => false,
            'is_dispatch' => false,
            'sort_order' => 1,
            'is_active' => true,
        ];
    }
}
