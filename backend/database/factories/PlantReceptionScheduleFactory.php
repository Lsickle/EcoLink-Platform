<?php

namespace Database\Factories;

use App\Models\Branch;
use App\Models\Organization;
use App\Models\PlantReceptionSchedule;
use App\Models\UnloadRequest;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PlantReceptionSchedule>
 */
class PlantReceptionScheduleFactory extends Factory
{
    protected $model = PlantReceptionSchedule::class;

    public function definition(): array
    {
        return [
            'tenant_organization_id' => Organization::factory(),
            'unload_request_id' => UnloadRequest::factory(),
            'receiving_branch_id' => Branch::factory(),
            'dock_location_id' => null,
            'scheduled_date' => now()->addDay()->toDateString(),
            'scheduled_start_at' => now()->addDay()->setTime(8, 0),
            'scheduled_end_at' => now()->addDay()->setTime(10, 0),
            'proposed_by_role' => PlantReceptionSchedule::ROLE_RECEPTION_COORDINATOR,
            'proposed_by_user_id' => User::factory(),
            'proposed_at' => now(),
            'status' => PlantReceptionSchedule::STATUS_PROPOSED,
            'version_number' => 1,
            'parent_schedule_id' => null,
            'is_active' => true,
        ];
    }
}
