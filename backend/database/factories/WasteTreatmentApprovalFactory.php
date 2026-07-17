<?php

namespace Database\Factories;

use App\Models\BranchTreatment;
use App\Models\Organization;
use App\Models\Waste;
use App\Models\WasteTreatmentApproval;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<WasteTreatmentApproval>
 */
class WasteTreatmentApprovalFactory extends Factory
{
    protected $model = WasteTreatmentApproval::class;

    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'waste_id' => Waste::factory(),
            'branch_treatment_id' => BranchTreatment::factory(),
            'version' => 1,
            'commercial_status' => 'DRAFT',
            'technical_status' => 'PENDING',
            'unit_price' => null,
            'currency' => 'COP',
            'billing_unit' => 'KG',
            'minimum_quantity' => null,
            'maximum_quantity' => null,
            'requires_lab_analysis' => false,
            'requires_sds' => false,
            'restrictions' => null,
            'commercial_notes' => null,
            'technical_notes' => null,
            'valid_from' => null,
            'valid_until' => null,
            'detailed_notes' => null,
            'is_active' => true,
        ];
    }

    /**
     * "Tratamiento viable" -- ambos ejes aprobados (ver
     * Waste::hasViableTreatment()).
     */
    public function viable(): static
    {
        return $this->state(fn () => [
            'technical_status' => 'APPROVED',
            'commercial_status' => 'APPROVED',
            'unit_price' => fake()->randomFloat(2, 10, 500),
        ]);
    }
}
