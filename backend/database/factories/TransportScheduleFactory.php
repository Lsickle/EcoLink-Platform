<?php

namespace Database\Factories;

use App\Models\Branch;
use App\Models\Organization;
use App\Models\TransportPersonnel;
use App\Models\TransportSchedule;
use App\Models\TransportStatus;
use App\Models\Vehicle;
use App\Models\WasteServiceRequest;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<TransportSchedule>
 */
class TransportScheduleFactory extends Factory
{
    protected $model = TransportSchedule::class;

    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'waste_service_request_id' => WasteServiceRequest::factory(),
            'transport_status_id' => TransportStatus::factory(),
            'schedule_number' => strtoupper(fake()->unique()->lexify('PRG-??????')),
            'source_branch_id' => Branch::factory(),
            'destination_branch_id' => Branch::factory(),
            'vehicle_id' => Vehicle::factory(),
            'transport_personnel_id' => TransportPersonnel::factory(),
            'responsible_user_id' => null,
            'scheduled_pickup_at' => now()->addDay(),
            'pickup_window_start' => null,
            'pickup_window_end' => null,
            'priority' => 'NORMAL',
            'estimated_weight_kg' => null,
            'estimated_volume_m3' => null,
            'planned_distance_km' => null,
            'planned_duration_minutes' => null,
            'requires_special_handling' => false,
            'observations' => null,
            'version_number' => 1,
            'parent_schedule_id' => null,
            'is_active' => true,
        ];
    }
}
