<?php

namespace Database\Factories;

use App\Models\HazardCharacteristic;
use App\Models\Waste;
use App\Models\WasteHazardCharacteristic;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<WasteHazardCharacteristic>
 */
class WasteHazardCharacteristicFactory extends Factory
{
    protected $model = WasteHazardCharacteristic::class;

    public function definition(): array
    {
        return [
            'waste_id' => Waste::factory(),
            'hazard_characteristic_id' => HazardCharacteristic::factory(),
        ];
    }
}
