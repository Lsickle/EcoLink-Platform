<?php

namespace Database\Factories;

use App\Models\ManifestUnload;
use App\Models\ManifestUnloadItem;
use App\Models\Organization;
use App\Models\Waste;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ManifestUnloadItem>
 */
class ManifestUnloadItemFactory extends Factory
{
    protected $model = ManifestUnloadItem::class;

    public function definition(): array
    {
        return [
            'tenant_organization_id' => Organization::factory(),
            'manifest_unload_id' => ManifestUnload::factory(),
            'manifest_load_item_id' => null,
            'unload_request_item_id' => null,
            'waste_id' => Waste::factory(),
            'received_quantity' => 0,
            'rejected_quantity' => 0,
            'unit_of_measure' => 'KG',
            'received_weight_kg' => null,
            'rejected_weight_kg' => 0,
            'received_volume_m3' => null,
            'received_container_quantity' => null,
            'reception_condition' => 'Conforme',
            'rejection_reason' => null,
            'inspection_approved' => true,
            'storage_location_id' => null,
            'received_at' => now(),
            'observations' => null,
            'line_number' => 1,
            'is_active' => true,
        ];
    }
}
