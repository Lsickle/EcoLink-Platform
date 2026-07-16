<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\OrganizationalArea;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<OrganizationalArea>
 */
class OrganizationalAreaFactory extends Factory
{
    protected $model = OrganizationalArea::class;

    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'code' => strtoupper(fake()->unique()->lexify('AREA_????')),
            'name' => fake()->unique()->jobTitle(),
            'parent_area_id' => null,
            'level' => fake()->randomElement(['Dirección', 'Gerencia', 'Coordinación']),
            'responsible_person_id' => null,
            'is_active' => true,
        ];
    }

    /**
     * Crea el área como hija de un padre ya existente, dentro de la misma
     * organización que ese padre (una jerarquía no cruza organizaciones).
     */
    public function childOf(OrganizationalArea $parent): static
    {
        return $this->state(fn () => [
            'organization_id' => $parent->organization_id,
            'parent_area_id' => $parent->id,
        ]);
    }
}
