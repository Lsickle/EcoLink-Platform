<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\CarteraStatusFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd (D-S04, catálogo de lookup para organization_cartera_statuses):
// cartera_statuses -- catálogo "Estados de Cartera" (6 valores confirmados
// en vivo contra Figma, ver docblock de la migración
// create_cartera_statuses_table). Tabla implícita, no listada
// explícitamente en el encargo de esta tarea -- ver resumen final para el
// detalle de esa inferencia.
#[Fillable(['code', 'name', 'description', 'blocks_new_requests', 'is_system', 'is_active'])]
class CarteraStatus extends Model
{
    /** @use HasFactory<CarteraStatusFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'blocks_new_requests' => 'boolean',
            'is_system' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function organizationCarteraStatuses(): HasMany
    {
        return $this->hasMany(OrganizationCarteraStatus::class);
    }
}
