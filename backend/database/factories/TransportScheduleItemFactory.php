<?php

namespace Database\Factories;

use App\Models\TransportSchedule;
use App\Models\TransportScheduleItem;
use App\Models\Waste;
use App\Models\WasteServiceRequestItem;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<TransportScheduleItem>
 */
class TransportScheduleItemFactory extends Factory
{
    protected $model = TransportScheduleItem::class;

    public function definition(): array
    {
        return [
            'transport_schedule_id' => TransportSchedule::factory(),
            'waste_service_request_item_id' => WasteServiceRequestItem::factory(),
            'waste_id' => Waste::factory(),
            'scheduled_quantity' => fake()->randomFloat(3, 1, 1000),
            'measurement_unit_id' => null,
            'estimated_weight_kg' => null,
            'estimated_volume_m3' => null,
            'container_quantity' => null,
            'packaging_type' => null,
            'length_cm' => null,
            'width_cm' => null,
            'height_cm' => null,
            'requires_special_handling' => false,
            'observations' => null,
            'is_active' => true,
        ];
    }
}
