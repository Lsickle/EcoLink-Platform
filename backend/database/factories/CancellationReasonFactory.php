<?php

namespace Database\Factories;

use App\Models\CancellationReason;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<CancellationReason>
 */
class CancellationReasonFactory extends Factory
{
    protected $model = CancellationReason::class;

    public function definition(): array
    {
        return [
            'organization_id' => null,
            'code' => strtoupper(fake()->unique()->lexify('REASON_??????')),
            'name' => fake()->unique()->words(3, true),
            'is_other' => false,
            'is_system' => true,
            'is_active' => true,
        ];
    }
}
