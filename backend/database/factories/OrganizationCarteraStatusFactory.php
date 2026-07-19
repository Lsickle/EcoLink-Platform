<?php

namespace Database\Factories;

use App\Models\CarteraStatus;
use App\Models\Organization;
use App\Models\OrganizationCarteraStatus;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<OrganizationCarteraStatus>
 */
class OrganizationCarteraStatusFactory extends Factory
{
    protected $model = OrganizationCarteraStatus::class;

    public function definition(): array
    {
        return [
            'generator_organization_id' => Organization::factory(),
            'gestor_organization_id' => Organization::factory(),
            'cartera_status_id' => CarteraStatus::factory(),
            'reason' => null,
            'blocked_at' => null,
            'unblocked_at' => null,
            'observations' => null,
            'is_active' => true,
        ];
    }
}
