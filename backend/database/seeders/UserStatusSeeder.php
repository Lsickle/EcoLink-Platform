<?php

namespace Database\Seeders;

use App\Models\UserStatus;
use Illuminate\Database\Seeder;

// esquema-bd, módulo Usuarios y Seguridad (D-U02): seed exacto documentado
// -- PENDING_ACTIVATION/ACTIVE/LOCKED/SUSPENDED/INACTIVE.
class UserStatusSeeder extends Seeder
{
    public function run(): void
    {
        $statuses = [
            ['code' => 'PENDING_ACTIVATION', 'name' => 'Pendiente de activación'],
            ['code' => 'ACTIVE', 'name' => 'Activo'],
            ['code' => 'LOCKED', 'name' => 'Bloqueado'],
            ['code' => 'SUSPENDED', 'name' => 'Suspendido'],
            ['code' => 'INACTIVE', 'name' => 'Inactivo'],
        ];

        foreach ($statuses as $status) {
            UserStatus::query()->updateOrCreate(
                ['code' => $status['code']],
                ['name' => $status['name'], 'is_system' => true, 'is_active' => true],
            );
        }
    }
}
