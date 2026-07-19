<?php

namespace App\Models;

use Database\Factories\WorkflowServiceBindingFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Validation\ValidationException;

// esquema-bd (item 17/D-WF-01): workflow_service_bindings -- personaliza
// qué workflow usa un `entity_type` para un sub-contexto (`scope_type`)
// concreto. Para personalización por organización: `scope_type='organization'`,
// `scope_id=organizations.id` -- consumido por `Workflow::resolveFor()`.
//
// Sin FK real sobre `scope_id` (sería polimórfica según `scope_type`) --
// mismo criterio que `files.entity_type`/`entity_id`.
//
// `entity_type` (hallazgo especialista-seguridad, requisito 3, revisión de
// WorkflowController): DENORMALIZADO desde `workflow.entity_type` -- soporta
// el UNIQUE(scope_type, scope_id, entity_type) que garantiza que
// `Workflow::resolveFor()` sea siempre determinista (nunca dos bindings
// activos apuntando a workflows DISTINTOS para el mismo scope+entity_type).
// Se autocompleta en `creating()` si no viene explícito, para no romper
// código/tests existentes que crean el binding sin conocer este detalle.
#[Fillable(['workflow_id', 'scope_type', 'scope_id', 'entity_type'])]
class WorkflowServiceBinding extends Model
{
    /** @use HasFactory<WorkflowServiceBindingFactory> */
    use HasFactory;

    public $timestamps = false;

    protected static function booted(): void
    {
        static::creating(function (self $binding) {
            $binding->entity_type ??= Workflow::query()->find($binding->workflow_id)?->entity_type;
        });
    }

    public function workflow(): BelongsTo
    {
        return $this->belongsTo(Workflow::class);
    }

    /**
     * Hallazgo especialista-seguridad (requisito 1, revisión de
     * WorkflowController): el `workflow_id` referenciado por un binding con
     * `scope_type='organization'` DEBE pertenecer a esa misma organización
     * (`workflow.tenant_organization_id === scope_id`) -- nunca se permite
     * enlazar el workflow de la Organización A al scope de la Organización B.
     * Se invoca antes de crear/actualizar cualquier
     * `workflow_service_bindings` (ver `WorkflowController::clone()`).
     */
    public static function assertBindingIntegrity(Workflow $workflow, string $scopeType, int $scopeId): void
    {
        if ($scopeType === 'organization' && $workflow->tenant_organization_id !== $scopeId) {
            throw ValidationException::withMessages([
                'workflow_id' => ['El workflow indicado no pertenece a la organización de este binding.'],
            ]);
        }
    }
}
