<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\SubgestorGestorRelationship;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<SubgestorGestorRelationship>
 */
class SubgestorGestorRelationshipFactory extends Factory
{
    protected $model = SubgestorGestorRelationship::class;

    public function definition(): array
    {
        return [
            'subgestor_organization_id' => Organization::factory(),
            'gestor_organization_id' => Organization::factory(),
            'authorized_by' => User::factory(),
            'authorized_at' => now(),
            'revoked_by' => null,
            'revoked_at' => null,
            'observations' => null,
            'is_active' => true,
        ];
    }

    public function revoked(): static
    {
        return $this->state(fn () => [
            'is_active' => false,
            'revoked_by' => User::factory(),
            'revoked_at' => now(),
        ]);
    }
}
