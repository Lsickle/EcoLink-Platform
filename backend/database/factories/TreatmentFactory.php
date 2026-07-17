<?php

namespace Database\Factories;

use App\Models\Treatment;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Treatment>
 */
class TreatmentFactory extends Factory
{
    protected $model = Treatment::class;

    public function definition(): array
    {
        return [
            'tenant_organization_id' => null,
            'code' => strtoupper(fake()->unique()->lexify('TRT_??????')),
            'name' => fake()->unique()->words(3, true),
            'description' => null,
            'treatment_type' => 'DISPOSAL',
            'requires_environmental_license' => true,
            'requires_special_transport' => false,
            'allows_recovery' => false,
            'requires_certificate' => true,
            'requires_weight_control' => true,
            'min_temperature' => null,
            'max_temperature' => null,
            'temperature_unit' => 'C',
            'risk_level' => 'MEDIUM',
            'estimated_processing_time_hours' => null,
            'is_system' => false,
            'is_active' => true,
        ];
    }
}
