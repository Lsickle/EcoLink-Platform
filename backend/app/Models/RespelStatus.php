<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\RespelStatusFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd (skill esquema-bd, líneas 1336-1361, item 17/D-WF-02):
// respel_statuses -- catálogo de estados del eje técnico/comercial de
// `waste_treatment_approvals` (motor de Workflow genérico, D-WF-01).
//
// `tenant_organization_id` NOT NULL (a diferencia de `treatments`/
// `waste_streams`) -- se puebla SIEMPRE con la organización PLATAFORMA
// (ver RespelStatusSeeder): el vocabulario de estados es un catálogo BASE
// compartido, no personalizable por organización -- lo que SÍ se
// personaliza es el workflow (transiciones/roles/reglas) que usa esos
// códigos, vía `workflow_service_bindings`.
#[Fillable([
    'tenant_organization_id', 'code', 'name', 'description', 'sort_order',
    'is_initial', 'is_final', 'is_approved_status', 'is_rejected_status',
    'requires_commercial_review', 'requires_environmental_review',
    'allows_service_request', 'requires_additional_information',
    'color_hex', 'icon', 'is_active', 'metadata',
])]
class RespelStatus extends Model
{
    /** @use HasFactory<RespelStatusFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'sort_order' => 'integer',
            'is_initial' => 'boolean',
            'is_final' => 'boolean',
            'is_approved_status' => 'boolean',
            'is_rejected_status' => 'boolean',
            'requires_commercial_review' => 'boolean',
            'requires_environmental_review' => 'boolean',
            'allows_service_request' => 'boolean',
            'requires_additional_information' => 'boolean',
            'is_active' => 'boolean',
            'metadata' => 'array',
        ];
    }

    public function tenantOrganization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'tenant_organization_id');
    }
}
