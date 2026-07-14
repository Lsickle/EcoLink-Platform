<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\PersonFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd: people. `full_name` (esquema-bd: "DEFAULT generated") se
// mantiene aquí en vez de como columna GENERATED en Postgres: concat_ws()
// y regexp_replace() quedaron marcadas no-IMMUTABLE contra estas columnas
// VARCHAR en Postgres 17, así que la migración solo crea la columna y este
// modelo la recalcula en cada guardado (ver booted() abajo).
#[Fillable([
    'tenant_organization_id', 'organization_id', 'document_type', 'document_number',
    'first_name', 'middle_name', 'last_name', 'second_last_name', 'birth_date',
    'gender', 'email', 'phone', 'address',
])]
class Person extends Model
{
    /** @use HasFactory<PersonFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'birth_date' => 'date',
            'is_active' => 'boolean',
            'metadata' => 'array',
        ];
    }

    protected static function booted(): void
    {
        static::saving(function (self $person) {
            $person->full_name = collect([
                $person->first_name,
                $person->middle_name,
                $person->last_name,
                $person->second_last_name,
            ])->filter()->implode(' ');
        });
    }

    public function tenantOrganization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'tenant_organization_id');
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function user(): HasOne
    {
        return $this->hasOne(User::class);
    }
}
