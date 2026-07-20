<?php

namespace Database\Factories;

use App\Models\Branch;
use App\Models\ManifestLoad;
use App\Models\ManifestStatus;
use App\Models\Organization;
use App\Models\Person;
use App\Models\TransportPersonnel;
use App\Models\TransportSchedule;
use App\Models\Vehicle;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ManifestLoad>
 */
class ManifestLoadFactory extends Factory
{
    protected $model = ManifestLoad::class;

    public function definition(): array
    {
        return [
            'tenant_organization_id' => Organization::factory(),
            'manifest_number' => strtoupper(fake()->unique()->lexify('MAN-??????')),
            'manifest_status_id' => ManifestStatus::factory(),
            'transport_schedule_id' => TransportSchedule::factory(),
            'generator_branch_id' => Branch::factory(),
            'carrier_organization_id' => Organization::factory(),
            'vehicle_id' => Vehicle::factory(),
            'transport_personnel_id' => TransportPersonnel::factory(),
            'load_date' => now()->toDateString(),
            'load_started_at' => null,
            'load_completed_at' => null,
            'declared_total_weight_kg' => null,
            'declared_total_volume_m3' => null,
            'generator_signer_person_id' => Person::factory(),
            'generator_signed_at' => null,
            'driver_signer_person_id' => Person::factory(),
            'driver_signed_at' => null,
            'pdf_file_id' => null,
            'observations' => null,
            'is_active' => true,
        ];
    }
}
