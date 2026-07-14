<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

// esquema-bd, módulo Usuarios y Seguridad (D-U02): catálogo nuevo.
// Seed: PENDING_ACTIVATION/ACTIVE/LOCKED/SUSPENDED/INACTIVE (ver
// database/seeders/UserStatusSeeder.php).
#[Fillable(['code', 'name', 'is_system', 'is_active'])]
class UserStatus extends Model
{
    use HasUuid;

    public $timestamps = true;

    protected function casts(): array
    {
        return [
            'is_system' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class, 'user_status_id');
    }
}
