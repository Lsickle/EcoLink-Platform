<?php

namespace Database\Factories;

use App\Models\Permission;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Permission>
 */
class PermissionFactory extends Factory
{
    protected $model = Permission::class;

    public function definition(): array
    {
        return [
            'code' => fake()->unique()->slug(2, '.'),
            'name' => fake()->words(3, true),
            'module' => fake()->word(),
            'action' => fake()->word(),
            'scope' => 'tenant',
            'is_system' => true,
            'is_active' => true,
        ];
    }
}
