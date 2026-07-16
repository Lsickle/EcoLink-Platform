<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\WasteStreamFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd: waste_streams -- catálogo de Corrientes de Residuos Y/A
// (Convenio de Basilea / Decreto 1076 de 2015). Primer módulo real del
// dominio Residuos. Alcance de este lote: NO incluye columnas de
// peligrosidad/estado físico (ya investigado y confirmado -- pertenecen al
// futuro residuo, no a la corriente) ni relación con `un_codes` (catálogos
// independientes).
#[Fillable([
    'tenant_organization_id', 'code', 'name', 'description', 'tipo',
    'requires_manifest', 'requires_special_transport',
    'is_system', 'is_active', 'metadata', 'created_by', 'updated_by',
])]
class WasteStream extends Model
{
    /** @use HasFactory<WasteStreamFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'requires_manifest' => 'boolean',
            'requires_special_transport' => 'boolean',
            'is_system' => 'boolean',
            'is_active' => 'boolean',
            'metadata' => 'array',
        ];
    }

    public function tenantOrganization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'tenant_organization_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    /**
     * Mismo criterio que Role::isAccessibleBy()/Permission::isAccessibleBy()
     * -- construido desde el día 1 para este catálogo (evita el hallazgo de
     * seguridad repetido en otros catálogos por no tenerlo desde el inicio).
     */
    public function isAccessibleBy(User $actor): bool
    {
        return $this->tenant_organization_id === null
            || $this->tenant_organization_id === $actor->tenant_organization_id;
    }
}
