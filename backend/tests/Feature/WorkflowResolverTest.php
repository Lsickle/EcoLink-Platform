<?php

use App\Models\Organization;
use App\Models\Workflow;
use App\Models\WorkflowServiceBinding;

// Workflow::resolveFor() -- consumido por el futuro refactor de
// WasteTreatmentApprovalController (tarea siguiente). Orden de resolución:
// 1) binding de organización -> workflow personalizado; 2) sin binding ->
// workflow BASE (tenant_organization_id NULL, is_system=true); 3) sin
// workflow base tampoco -> null.

test('sin ningún binding, resuelve al workflow BASE del entity_type', function () {
    $base = Workflow::factory()->create([
        'tenant_organization_id' => null,
        'entity_type' => 'TREATMENT',
        'is_system' => true,
        'is_active' => true,
    ]);
    $organization = Organization::factory()->create();

    $resolved = Workflow::resolveFor('TREATMENT', $organization->id);

    expect($resolved)->not->toBeNull()->and($resolved->id)->toBe($base->id);
});

test('con un workflow_service_binding de la organización, resuelve al workflow personalizado en vez del base', function () {
    Workflow::factory()->create([
        'tenant_organization_id' => null,
        'entity_type' => 'TREATMENT',
        'is_system' => true,
        'is_active' => true,
    ]);

    $organization = Organization::factory()->create();
    $custom = Workflow::factory()->create([
        'tenant_organization_id' => $organization->id,
        'entity_type' => 'TREATMENT',
        'is_system' => false,
        'is_active' => true,
    ]);

    WorkflowServiceBinding::query()->create([
        'workflow_id' => $custom->id,
        'scope_type' => 'organization',
        'scope_id' => $organization->id,
    ]);

    $resolved = Workflow::resolveFor('TREATMENT', $organization->id);

    expect($resolved)->not->toBeNull()->and($resolved->id)->toBe($custom->id);
});

test('el binding de OTRA organización no afecta la resolución de esta organización (cae al base)', function () {
    $base = Workflow::factory()->create([
        'tenant_organization_id' => null,
        'entity_type' => 'TREATMENT',
        'is_system' => true,
        'is_active' => true,
    ]);

    $otherOrganization = Organization::factory()->create();
    $customForOther = Workflow::factory()->create([
        'tenant_organization_id' => $otherOrganization->id,
        'entity_type' => 'TREATMENT',
        'is_system' => false,
        'is_active' => true,
    ]);

    WorkflowServiceBinding::query()->create([
        'workflow_id' => $customForOther->id,
        'scope_type' => 'organization',
        'scope_id' => $otherOrganization->id,
    ]);

    $organizationWithoutBinding = Organization::factory()->create();

    $resolved = Workflow::resolveFor('TREATMENT', $organizationWithoutBinding->id);

    expect($resolved)->not->toBeNull()->and($resolved->id)->toBe($base->id);
});

test('organización sin ningún binding ni workflow base para ese entity_type -> null', function () {
    $organization = Organization::factory()->create();

    $resolved = Workflow::resolveFor('CERTIFICATE', $organization->id);

    expect($resolved)->toBeNull();
});

test('con organizationId NULL, resuelve directo al workflow BASE (sin consultar bindings)', function () {
    $base = Workflow::factory()->create([
        'tenant_organization_id' => null,
        'entity_type' => 'TREATMENT',
        'is_system' => true,
        'is_active' => true,
    ]);

    $resolved = Workflow::resolveFor('TREATMENT', null);

    expect($resolved)->not->toBeNull()->and($resolved->id)->toBe($base->id);
});

test('un workflow base inactivo (is_active=false) no se resuelve', function () {
    Workflow::factory()->create([
        'tenant_organization_id' => null,
        'entity_type' => 'TREATMENT',
        'is_system' => true,
        'is_active' => false,
    ]);

    $resolved = Workflow::resolveFor('TREATMENT', null);

    expect($resolved)->toBeNull();
});
