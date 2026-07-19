<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\TransportRoute;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<TransportRoute>
 */
class TransportRouteFactory extends Factory
{
    protected $model = TransportRoute::class;

    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'route_code' => strtoupper(fake()->unique()->lexify('RUTA-??????')),
            'name' => fake()->words(2, true),
            'route_date' => null,
            'observations' => null,
            'is_active' => true,
        ];
    }
}
