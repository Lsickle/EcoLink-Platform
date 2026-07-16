<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Relations\Concerns\AsPivot;
use Illuminate\Database\Eloquent\Relations\Pivot;

// esquema-bd: organization_business_roles. UNIQUE(organization_id, business_role_id).
//
// AVISO (hallazgo Alto, especialista-seguridad 2026-07-14): este pivote NO
// usa SoftDeletes -- BelongsToMany::wherePivot()/withPivot() de Laravel no
// aplica automáticamente el global scope de SoftDeletes de un pivote
// personalizado, así que un ->delete() (soft) sobre esta tabla NO revocaría
// realmente una capacidad frente a Organization::hasCapability() (que no
// filtra por deleted_at). El único mecanismo de revocación soportado es
// `is_active=false` -- es lo único que usan AssignBusinessRoleCommand y los
// tests. No reactivar SoftDeletes aquí sin resolver ese hueco de control de
// acceso primero.
class OrganizationBusinessRole extends Pivot
{
    use AsPivot, HasUuid;

    protected $table = 'organization_business_roles';

    public $incrementing = true;

    protected function casts(): array
    {
        return [
            'assigned_at' => 'datetime',
            'is_active' => 'boolean',
        ];
    }
}
