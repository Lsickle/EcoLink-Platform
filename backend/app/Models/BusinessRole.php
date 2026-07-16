<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\BusinessRoleFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd: business_roles. Eje 2 de autorización: el "tipo de
// organización" (GENERATOR/GESTOR/SUBGESTOR/TRANSPORTER/COMERCIALIZADOR),
// independiente del RBAC de usuario individual (eje 1, Role/Permission).
#[Fillable([
    'code', 'name', 'description',
    'can_generate_waste', 'can_transport_waste', 'can_treat_waste',
    'can_approve_treatments', 'can_issue_manifests',
    'can_issue_disposal_certificates', 'requires_environmental_license',
    'requires_transport_authorization',
    'sort_order', 'is_system', 'is_active', 'metadata',
])]
class BusinessRole extends Model
{
    /** @use HasFactory<BusinessRoleFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'can_generate_waste' => 'boolean',
            'can_transport_waste' => 'boolean',
            'can_treat_waste' => 'boolean',
            'can_approve_treatments' => 'boolean',
            'can_issue_manifests' => 'boolean',
            'can_issue_disposal_certificates' => 'boolean',
            'requires_environmental_license' => 'boolean',
            'requires_transport_authorization' => 'boolean',
            'is_system' => 'boolean',
            'is_active' => 'boolean',
            'metadata' => 'array',
        ];
    }

    public function organizations(): BelongsToMany
    {
        return $this->belongsToMany(Organization::class, 'organization_business_roles')
            ->using(OrganizationBusinessRole::class)
            ->withPivot(['assigned_by', 'assigned_at', 'is_active'])
            ->withTimestamps();
    }
}
