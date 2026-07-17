<?php

namespace Database\Factories;

use App\Models\GenerationFrequency;
use App\Models\MeasurementUnit;
use App\Models\Organization;
use App\Models\Waste;
use App\Models\WasteCategory;
use App\Models\WasteOperationalStatus;
use App\Models\WasteType;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Waste>
 */
class WasteFactory extends Factory
{
    protected $model = Waste::class;

    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'branch_id' => null,
            'waste_category_id' => WasteCategory::factory(),
            'code' => null,
            'name' => fake()->unique()->words(3, true),
            'description' => null,
            'waste_type_id' => WasteType::factory(),
            'is_template' => false,
            'is_preapproved' => false,
            'preapproved_by_organization_id' => null,
            'requires_characterization' => false,
            'requires_sds' => false,
            'physical_state_id' => null,
            'measurement_unit_id' => MeasurementUnit::factory(),
            'average_weight' => null,
            'generation_frequency_id' => GenerationFrequency::factory(),
            'requires_special_transport' => false,
            'requires_special_ppe' => false,
            'operational_status_id' => WasteOperationalStatus::factory(),
            'quantity' => fake()->randomFloat(2, 1, 1000),
            'generation_date' => now()->toDateString(),
            'internal_reference' => null,
            'operational_notes' => null,
            'is_active' => true,
        ];
    }
}
