<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

// esquema-bd: organizations.
#[Fillable([
    'legal_name', 'trade_name', 'tax_id', 'tax_id_type', 'email', 'phone', 'website',
    'organization_status_id', 'registration_date', 'is_platform_tenant', 'observations',
    'economic_activity_code', 'economic_activity_name', 'environmental_authority',
    'environmental_registration', 'billing_email', 'support_email', 'timezone',
    'country_code', 'currency_code', 'company_size', 'employee_count', 'customer_since',
    'risk_level', 'parent_organization_id',
])]
class Organization extends Model
{
    use HasUuid, SoftDeletes;

    protected static function booted(): void
    {
        // organizations es la única tabla con un segundo UUID propio
        // (traceability_uuid, además de uuid) -- ver HasUuid para el porqué
        // de generarlo en PHP en vez de confiar en el DEFAULT de Postgres.
        static::creating(function (self $organization) {
            $organization->traceability_uuid ??= (string) Str::uuid();
        });
    }

    protected function casts(): array
    {
        return [
            'registration_date' => 'date',
            'is_active' => 'boolean',
            // D-CER-04: exactamente una fila TRUE (EcoLink) en todo el sistema.
            'is_platform_tenant' => 'boolean',
            'custom_fields_enabled' => 'boolean',
            'metadata_json' => 'array',
            'storage_quota_gb' => 'decimal:2',
            'storage_used_gb' => 'decimal:2',
            'last_activity_at' => 'datetime',
            'contract_expiration_date' => 'date',
            'customer_since' => 'date',
        ];
    }

    public function status(): BelongsTo
    {
        return $this->belongsTo(OrganizationStatus::class, 'organization_status_id');
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'parent_organization_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(Organization::class, 'parent_organization_id');
    }

    public function people(): HasMany
    {
        return $this->hasMany(Person::class);
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }
}
