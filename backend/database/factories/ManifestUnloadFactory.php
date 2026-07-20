<?php

namespace Database\Factories;

use App\Models\Branch;
use App\Models\ManifestStatus;
use App\Models\ManifestUnload;
use App\Models\Organization;
use App\Models\Person;
use App\Models\TransportPersonnel;
use App\Models\UnloadRequest;
use App\Models\Vehicle;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ManifestUnload>
 */
class ManifestUnloadFactory extends Factory
{
    protected $model = ManifestUnload::class;

    public function definition(): array
    {
        return [
            'tenant_organization_id' => Organization::factory(),
            'manifest_number' => strtoupper(fake()->unique()->lexify('MUN-??????')),
            'manifest_status_id' => ManifestStatus::factory(),
            'manifest_load_id' => null,
            // D-PRG-05 (CHECK manifest_unloads_load_or_request_check): AL
            // MENOS UNO de manifest_load_id/unload_request_id debe estar
            // presente -- la factory por defecto puebla unload_request_id.
            'unload_request_id' => UnloadRequest::factory(),
            'receiving_branch_id' => Branch::factory(),
            'receiving_organization_id' => Organization::factory(),
            'vehicle_id' => Vehicle::factory(),
            'transport_personnel_id' => TransportPersonnel::factory(),
            'unload_date' => now()->toDateString(),
            'unload_started_at' => null,
            'unload_completed_at' => null,
            'received_total_weight_kg' => null,
            'rejected_total_weight_kg' => 0,
            'received_total_volume_m3' => null,
            'received_as_expected' => true,
            'receiver_person_id' => Person::factory(),
            'receiver_signed_at' => null,
            'driver_signer_person_id' => Person::factory(),
            'driver_signed_at' => null,
            'pdf_file_id' => null,
            'incidents' => null,
            'observations' => null,
            'is_active' => true,
        ];
    }
}
