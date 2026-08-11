<?php

namespace Database\Factories;

use App\Models\GeneratorSubgestorRelationship;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<GeneratorSubgestorRelationship>
 */
class GeneratorSubgestorRelationshipFactory extends Factory
{
    protected $model = GeneratorSubgestorRelationship::class;

    public function definition(): array
    {
        return [
            'generator_organization_id' => Organization::factory(),
            'subgestor_organization_id' => Organization::factory(),
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
