<?php

namespace Database\Factories;

use App\Models\Role;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Role>
 */
class RoleFactory extends Factory
{
    protected $model = Role::class;

    public function definition(): array
    {
        return [
            'code' => strtoupper(fake()->unique()->lexify('ROLE_??????')),
            'name' => fake()->unique()->jobTitle(),
            'description' => fake()->sentence(),
            'is_system' => false,
            'is_editable' => true,
            'priority_level' => 1,
            'is_active' => true,
        ];
    }
}
