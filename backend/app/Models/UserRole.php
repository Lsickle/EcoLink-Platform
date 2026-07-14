<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Relations\Concerns\AsPivot;
use Illuminate\Database\Eloquent\Relations\Pivot;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd, módulo Usuarios y Seguridad (D-U01): user_roles, tabla nueva
// crítica -- RN-027 / CU-006.7. UNIQUE(user_id, role_id).
class UserRole extends Pivot
{
    use AsPivot, HasUuid, SoftDeletes;

    protected $table = 'user_roles';

    public $incrementing = true;

    protected function casts(): array
    {
        return [
            'assigned_at' => 'datetime',
            'expires_at' => 'datetime',
            'is_active' => 'boolean',
        ];
    }
}
