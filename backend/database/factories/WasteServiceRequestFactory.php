<?php

namespace Database\Factories;

use App\Models\Branch;
use App\Models\Organization;
use App\Models\ServiceStatus;
use App\Models\WasteServiceRequest;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<WasteServiceRequest>
 */
class WasteServiceRequestFactory extends Factory
{
    protected $model = WasteServiceRequest::class;

    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'branch_id' => Branch::factory(),
            'request_code' => strtoupper(fake()->unique()->lexify('SOL-??????')),
            'service_status_id' => ServiceStatus::factory(),
            'requested_at' => now(),
            'requested_collection_date' => null,
            'estimated_ready_date' => null,
            'scheduled_collection_date' => null,
            'estimated_total_weight' => null,
            'estimated_total_volume' => null,
            'measurement_unit_id' => null,
            'packaging_type' => null,
            'requires_lift_platform' => false,
            'requires_audit' => false,
            'requires_photo_record' => false,
            'requires_container_return' => false,
            'observations' => null,
            'request_source' => 'PORTAL',
            'priority' => 'NORMAL',
            'requested_by' => null,
            'is_active' => true,
        ];
    }
}
