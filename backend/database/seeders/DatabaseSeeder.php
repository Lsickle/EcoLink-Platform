<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $this->call(UserStatusSeeder::class);

        User::factory()->create([
            'username' => 'test.user',
            'email' => 'test@example.com',
        ]);
    }
}
