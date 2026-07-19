<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\ServiceItemStatusFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd (D-S10): service_item_statuses -- catálogo SEPARADO de
// `service_statuses`, viabilidad de recolección de un ítem individual de una
// solicitud. Catálogo GLOBAL simple, sin `organization_id` -- ver docblock
// de la migración create_service_item_statuses_table (personalización por
// Gestor explícitamente pendiente, issue S-37, no resuelta).
#[Fillable(['code', 'name', 'description', 'is_system', 'is_active'])]
class ServiceItemStatus extends Model
{
    /** @use HasFactory<ServiceItemStatusFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'is_system' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(WasteServiceRequestItem::class, 'item_status_id');
    }
}
