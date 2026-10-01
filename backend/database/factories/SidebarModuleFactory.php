<?php

namespace Database\Factories;

use App\Models\SidebarModule;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<SidebarModule>
 */
class SidebarModuleFactory extends Factory
{
    protected $model = SidebarModule::class;

    public function definition(): array
    {
        return [
            'code' => strtoupper(fake()->unique()->lexify('SM_??????')),
            'name' => fake()->unique()->words(2, true),
            'sort_order' => 1,
            'is_active' => true,
        ];
    }
}
