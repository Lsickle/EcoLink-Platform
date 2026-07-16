<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\Vehicle;
use App\Models\VehicleType;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Vehicle>
 */
class VehicleFactory extends Factory
{
    protected $model = Vehicle::class;

    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'branch_id' => null,
            'code' => null,
            'plate_number' => strtoupper(fake()->unique()->bothify('???###')),
            'vin' => null,
            'vehicle_type_id' => VehicleType::factory(),
            'brand' => fake()->randomElement(['Chevrolet', 'Hino', 'Kenworth', 'International', 'Foton']),
            'model' => fake()->bothify('???-####'),
            'manufacturing_year' => fake()->numberBetween(2015, 2025),
            'max_load_capacity' => fake()->randomFloat(2, 500, 30000),
            'capacity_unit' => 'KG',
            'supports_hazmat' => fake()->boolean(),
            'has_gps' => fake()->boolean(),
            'operational_status' => 'ACTIVE',
            'soat_expiration_date' => null,
            'technical_inspection_expiration' => null,
            'is_active' => true,
        ];
    }
}
