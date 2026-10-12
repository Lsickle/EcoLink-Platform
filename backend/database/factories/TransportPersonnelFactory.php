<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\OrganizationContact;
use App\Models\Person;
use App\Models\TransportPersonnel;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<TransportPersonnel>
 */
class TransportPersonnelFactory extends Factory
{
    protected $model = TransportPersonnel::class;

    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'person_id' => Person::factory(),
            'license_number' => fake()->unique()->numerify('LIC-########'),
            'license_category' => fake()->randomElement(['B2', 'C1', 'C2', 'C3']),
            'license_expiration_date' => fake()->dateTimeBetween('+6 months', '+3 years'),
            'has_hazmat_permit' => false,
            'is_active' => true,
        ];
    }

    /**
     * Un conductor real siempre es una `Person` con vínculo ACTIVO en
     * `organization_contacts` con su organización: lo exige
     * `TransportPersonnelController::store()` al registrarlo y, desde
     * 2026-10-12, `TransportScheduleController` al asignarlo a una
     * programación. La factory reproduce ese invariante por defecto; un test
     * que necesite el caso "desvinculado" desactiva el vínculo después.
     */
    public function configure(): static
    {
        return $this->afterCreating(function (TransportPersonnel $personnel): void {
            OrganizationContact::query()->firstOrCreate(
                ['contact_id' => $personnel->person_id, 'organization_id' => $personnel->organization_id],
                ['relationship_type' => 'Empleado', 'is_primary' => false, 'is_active' => true],
            );
        });
    }
}
