<?php

namespace Database\Factories;

use App\Models\Waste;
use App\Models\WasteServiceRequest;
use App\Models\WasteServiceRequestItem;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<WasteServiceRequestItem>
 */
class WasteServiceRequestItemFactory extends Factory
{
    protected $model = WasteServiceRequestItem::class;

    public function definition(): array
    {
        return [
            'service_request_id' => WasteServiceRequest::factory(),
            'item_sequence' => 1,
            'waste_id' => Waste::factory(),
            'waste_treatment_approval_id' => null,
            'waste_name_snapshot' => fake()->words(3, true),
            'waste_code_snapshot' => null,
            'treatment_snapshot' => null,
            'estimated_quantity' => fake()->randomFloat(2, 1, 1000),
            'actual_quantity' => null,
            'estimated_weight' => null,
            'actual_weight' => null,
            'measurement_unit_id' => null,
            'packaging_type' => null,
            'physical_state_id' => null,
            'is_stackable' => false,
            'requires_forklift' => false,
            'requires_isolation' => false,
            'height' => null,
            'width' => null,
            'length' => null,
            'calculated_volume' => null,
            'item_status_id' => null,
            'observations' => null,
            'is_active' => true,
        ];
    }
}
