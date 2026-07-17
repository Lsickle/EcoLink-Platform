<?php

namespace Database\Factories;

use App\Models\UnCode;
use App\Models\Waste;
use App\Models\WasteUnCode;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<WasteUnCode>
 */
class WasteUnCodeFactory extends Factory
{
    protected $model = WasteUnCode::class;

    public function definition(): array
    {
        return [
            'waste_id' => Waste::factory(),
            'un_code_id' => UnCode::factory(),
            'is_primary' => false,
            'classification_source' => 'MANUAL',
            'classified_at' => now(),
            'classified_by' => null,
            'valid_from' => null,
            'valid_until' => null,
        ];
    }
}
