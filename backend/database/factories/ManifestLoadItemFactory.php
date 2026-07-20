<?php

namespace Database\Factories;

use App\Models\ManifestLoad;
use App\Models\ManifestLoadItem;
use App\Models\Organization;
use App\Models\Waste;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ManifestLoadItem>
 */
class ManifestLoadItemFactory extends Factory
{
    protected $model = ManifestLoadItem::class;

    public function definition(): array
    {
        return [
            'tenant_organization_id' => Organization::factory(),
            'manifest_load_id' => ManifestLoad::factory(),
            'transport_schedule_item_id' => null,
            'waste_id' => Waste::factory(),
            'approved_treatment_id' => null,
            'declared_quantity' => fake()->randomFloat(3, 1, 1000),
            'unit_of_measure' => 'KG',
            'actual_weight_kg' => null,
            'actual_volume_m3' => null,
            'container_quantity' => null,
            'packaging_type' => null,
            'internal_container_code' => null,
            'packaging_condition' => null,
            'transport_approved' => true,
            'special_handling_required' => false,
            'observations' => null,
            'line_number' => 1,
            'is_active' => true,
        ];
    }
}
