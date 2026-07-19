<?php

namespace App\Models;

use Database\Factories\WorkflowEntityBindingFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

// esquema-bd (item 17/D-WF-01): workflow_entity_bindings -- qué workflow
// gobierna una columna de estado de una entidad concreta.
//
// CORRECCIÓN sobre el DDL resumido del skill (ver docblock de la
// migración): `UNIQUE(entity_table, status_column)`, no
// `UNIQUE(entity_table)` -- `waste_treatment_approvals` necesita dos
// bindings simultáneos (`technical_status_id`/`commercial_status_id`).
#[Fillable(['workflow_id', 'entity_table', 'status_catalog_table', 'status_column'])]
class WorkflowEntityBinding extends Model
{
    /** @use HasFactory<WorkflowEntityBindingFactory> */
    use HasFactory;

    public $timestamps = false;

    public function workflow(): BelongsTo
    {
        return $this->belongsTo(Workflow::class);
    }
}
