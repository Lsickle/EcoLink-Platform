<?php

use App\Models\BusinessRole;
use App\Models\Role;
use App\Models\Workflow;
use App\Models\WorkflowEntityBinding;
use App\Models\WorkflowTransition;
use App\Models\WorkflowTransitionRole;
use App\Models\WorkflowVersion;
use Illuminate\Database\QueryException;

// Constraints de esquema del motor de Workflow genérico (D-WF-01) que no se
// cubren en RespelStatusSeederTest/WorkflowSeederTest.

test('workflow_transition_roles rechaza una fila con AMBOS role_id y business_role_id nulos', function () {
    $transition = WorkflowTransition::factory()->create();

    expect(fn () => WorkflowTransitionRole::query()->create([
        'workflow_transition_id' => $transition->id,
        'role_id' => null,
        'business_role_id' => null,
    ]))->toThrow(QueryException::class);
});

test('workflow_transition_roles rechaza una fila con AMBOS role_id y business_role_id no nulos', function () {
    $transition = WorkflowTransition::factory()->create();
    $role = Role::factory()->create();
    $businessRole = BusinessRole::factory()->create();

    expect(fn () => WorkflowTransitionRole::query()->create([
        'workflow_transition_id' => $transition->id,
        'role_id' => $role->id,
        'business_role_id' => $businessRole->id,
    ]))->toThrow(QueryException::class);
});

test('workflow_transition_roles acepta exactamente uno de los dos (role_id o business_role_id)', function () {
    $transition = WorkflowTransition::factory()->create();
    $role = Role::factory()->create();
    $businessRole = BusinessRole::factory()->create();

    $byRole = WorkflowTransitionRole::query()->create([
        'workflow_transition_id' => $transition->id,
        'role_id' => $role->id,
        'business_role_id' => null,
    ]);
    $byBusinessRole = WorkflowTransitionRole::query()->create([
        'workflow_transition_id' => $transition->id,
        'role_id' => null,
        'business_role_id' => $businessRole->id,
    ]);

    expect($byRole->exists)->toBeTrue()->and($byBusinessRole->exists)->toBeTrue();
});

test('workflow_entity_bindings permite DOS bindings para la misma entity_table con distinto status_column (corrección sobre el DDL del skill)', function () {
    $workflow = Workflow::factory()->create();

    $technical = WorkflowEntityBinding::query()->create([
        'workflow_id' => $workflow->id,
        'entity_table' => 'waste_treatment_approvals',
        'status_catalog_table' => 'respel_statuses',
        'status_column' => 'technical_status_id',
    ]);
    $commercial = WorkflowEntityBinding::query()->create([
        'workflow_id' => $workflow->id,
        'entity_table' => 'waste_treatment_approvals',
        'status_catalog_table' => 'respel_statuses',
        'status_column' => 'commercial_status_id',
    ]);

    expect($technical->exists)->toBeTrue()->and($commercial->exists)->toBeTrue();
});

test('workflow_entity_bindings rechaza dos bindings para la misma entity_table Y el mismo status_column', function () {
    $workflow = Workflow::factory()->create();

    WorkflowEntityBinding::query()->create([
        'workflow_id' => $workflow->id,
        'entity_table' => 'waste_treatment_approvals',
        'status_catalog_table' => 'respel_statuses',
        'status_column' => 'technical_status_id',
    ]);

    expect(fn () => WorkflowEntityBinding::query()->create([
        'workflow_id' => $workflow->id,
        'entity_table' => 'waste_treatment_approvals',
        'status_catalog_table' => 'respel_statuses',
        'status_column' => 'technical_status_id',
    ]))->toThrow(QueryException::class);
});

test('workflows.current_version_id se puede apuntar a una workflow_version existente (cierra la referencia circular)', function () {
    $workflow = Workflow::factory()->create();
    $version = WorkflowVersion::factory()->create(['workflow_id' => $workflow->id]);

    $workflow->forceFill(['current_version_id' => $version->id])->save();

    expect($workflow->fresh()->currentVersion->id)->toBe($version->id);
});

test('borrar una workflow_version deja current_version_id en NULL (nullOnDelete)', function () {
    $workflow = Workflow::factory()->create();
    $version = WorkflowVersion::factory()->create(['workflow_id' => $workflow->id]);
    $workflow->forceFill(['current_version_id' => $version->id])->save();

    $version->delete();

    expect($workflow->fresh()->current_version_id)->toBeNull();
});
