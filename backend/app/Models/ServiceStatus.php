<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\ServiceStatusFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd (Módulo Solicitudes de Servicio, D-S02/D-S05/D-S15):
// service_statuses -- catálogo de estados de `waste_service_requests`.
// `organization_id` NULL = catálogo GLOBAL/default (D-S02); un valor =
// estado personalizado de ESE Gestor. Ver docblock de la migración
// create_service_statuses_table para el detalle completo de las decisiones
// aplicadas (D-S02/D-S05/D-S15).
#[Fillable([
    'organization_id', 'code', 'name', 'description', 'sequence_order',
    'is_initial_status', 'is_terminal_status', 'is_system_status',
    'blocks_editing', 'is_active', 'metadata',
])]
class ServiceStatus extends Model
{
    /** @use HasFactory<ServiceStatusFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'sequence_order' => 'integer',
            'is_initial_status' => 'boolean',
            'is_terminal_status' => 'boolean',
            'is_system_status' => 'boolean',
            'blocks_editing' => 'boolean',
            'is_active' => 'boolean',
            'metadata' => 'array',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function serviceRequests(): HasMany
    {
        return $this->hasMany(WasteServiceRequest::class);
    }

    public function organizationActivations(): HasMany
    {
        return $this->hasMany(OrganizationServiceStatus::class);
    }
}
