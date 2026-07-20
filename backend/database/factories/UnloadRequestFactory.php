<?php

namespace Database\Factories;

use App\Models\Branch;
use App\Models\Organization;
use App\Models\UnloadRequest;
use App\Models\UnloadRequestStatus;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<UnloadRequest>
 */
class UnloadRequestFactory extends Factory
{
    protected $model = UnloadRequest::class;

    public function definition(): array
    {
        return [
            'tenant_organization_id' => Organization::factory(),
            'request_number' => strtoupper(fake()->unique()->lexify('SOL-??????')),
            'unload_request_status_id' => UnloadRequestStatus::factory(),
            'receiving_branch_id' => Branch::factory(),
            'manifest_load_id' => null,
            'transport_schedule_id' => null,
            'origin_branch_id' => null,
            'carrier_organization_id' => null,
            'vehicle_id' => null,
            'transport_personnel_id' => null,
            'service_modality' => UnloadRequest::MODALITY_COLLECTION,
            'estimated_arrival_at' => null,
            'priority' => 'NORMAL',
            'is_active' => true,
        ];
    }
}
