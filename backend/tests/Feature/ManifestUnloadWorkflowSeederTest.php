<?php

use App\Models\Role;
use App\Models\Workflow;
use App\Models\WorkflowEntityBinding;
use App\Models\WorkflowTransition;
use Database\Seeders\ManifestLoadWorkflowSeeder;
use Database\Seeders\ManifestUnloadWorkflowSeeder;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\PlatformOrganizationSeeder;
use Database\Seeders\RoleSeeder;

// Workflow BASE "Manifiesto de Descargue" (Fase 5) -- entity_type=MANIFEST,
// MISMO entity_type que "Manifiesto de Cargue" (Fase 3), workflow de sistema
// PROPIO desambiguado vía workflow_entity_bindings.entity_table.

beforeEach(function () {
    $this->seed(OrganizationStatusSeeder::class);
    $this->seed(PlatformOrganizationSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->seed(PermissionSeeder::class);
    // Ambos workflows MANIFEST conviven en la BD -- clave del test de
    // desambiguación de abajo.
    $this->seed(ManifestLoadWorkflowSeeder::class);
    $this->seed(ManifestUnloadWorkflowSeeder::class);
});

test('crea exactamente un workflow BASE de sistema para MANIFEST_UNLOAD, DISTINTO del de MANIFEST_LOAD', function () {
    $workflow = Workflow::query()->where('code', 'MANIFEST_UNLOAD')->firstOrFail();
    $otherWorkflow = Workflow::query()->where('code', 'MANIFEST_LOAD')->firstOrFail();

    expect($workflow->tenant_organization_id)->toBeNull()
        ->and($workflow->entity_type)->toBe('MANIFEST')
        ->and($workflow->is_system)->toBeTrue()
        ->and($workflow->is_active)->toBeTrue()
        ->and($workflow->id)->not->toBe($otherWorkflow->id);

    expect(Workflow::query()->where('entity_type', 'MANIFEST')->count())->toBe(2);
});

test('la versión actual del workflow está PUBLISHED y es la current_version_id', function () {
    $workflow = Workflow::query()->where('code', 'MANIFEST_UNLOAD')->firstOrFail();

    expect($workflow->current_version_id)->not->toBeNull();

    $version = $workflow->currentVersion;

    expect($version->status)->toBe('PUBLISHED')
        ->and($version->published_at)->not->toBeNull()
        ->and($version->version_number)->toBe(1);
});

test('el seeder es idempotente (correr dos veces no duplica transiciones ni roles)', function () {
    $transitionsBefore = WorkflowTransition::query()->count();

    $this->seed(ManifestUnloadWorkflowSeeder::class);

    expect(Workflow::query()->where('code', 'MANIFEST_UNLOAD')->count())->toBe(1)
        ->and(WorkflowTransition::query()->count())->toBe($transitionsBefore);
});

test('siembra exactamente 6 transiciones (2 humanas del grafo principal + 2 automáticas de firma + 2 de cancelación)', function () {
    $version = Workflow::query()->where('code', 'MANIFEST_UNLOAD')->firstOrFail()->currentVersion;

    // DRAFT->GENERATED, SIGNED->CLOSED (humanas) + GENERATED->PARTIALLY_SIGNED,
    // PARTIALLY_SIGNED->SIGNED (automáticas) + GENERATED->CANCELLED,
    // PARTIALLY_SIGNED->CANCELLED (cancelación) = 6.
    expect($version->transitions()->count())->toBe(6);
});

dataset('transiciones humanas autorizadas para LOGÍSTICA', [
    ['DRAFT', 'GENERATED'],
    ['SIGNED', 'CLOSED'],
]);

test('las transiciones humanas están autorizadas para el rol de sistema LOGÍSTICA', function (string $from, string $to) {
    $logistica = Role::query()->where('code', 'LOGÍSTICA')->firstOrFail();
    $version = Workflow::query()->where('code', 'MANIFEST_UNLOAD')->firstOrFail()->currentVersion;

    $transition = $version->transitions()->where('from_status_code', $from)->where('to_status_code', $to)->firstOrFail();

    expect($transition->roles)->toHaveCount(1)
        ->and($transition->roles->first()->role_id)->toBe($logistica->id)
        ->and($transition->roles->first()->business_role_id)->toBeNull();
})->with('transiciones humanas autorizadas para LOGÍSTICA');

dataset('transiciones automáticas disparadas por la firma', [
    ['GENERATED', 'PARTIALLY_SIGNED'],
    ['PARTIALLY_SIGNED', 'SIGNED'],
]);

test('las transiciones automáticas de firma NO tienen workflow_transition_roles', function (string $from, string $to) {
    $version = Workflow::query()->where('code', 'MANIFEST_UNLOAD')->firstOrFail()->currentVersion;

    $transition = $version->transitions()->where('from_status_code', $from)->where('to_status_code', $to)->firstOrFail();

    expect($transition->is_automatic)->toBeTrue()
        ->and($transition->roles)->toHaveCount(0);
})->with('transiciones automáticas disparadas por la firma');

dataset('estados desde los que se puede cancelar', [
    ['GENERATED'], ['PARTIALLY_SIGNED'],
]);

test('CANCELLED es alcanzable desde Generated/PartiallySigned, autorizado para LOGÍSTICA', function (string $from) {
    $logistica = Role::query()->where('code', 'LOGÍSTICA')->firstOrFail();
    $version = Workflow::query()->where('code', 'MANIFEST_UNLOAD')->firstOrFail()->currentVersion;

    $transition = $version->transitions()->where('from_status_code', $from)->where('to_status_code', 'CANCELLED')->firstOrFail();

    expect($transition->roles->first()->role_id)->toBe($logistica->id);
})->with('estados desde los que se puede cancelar');

test('DRAFT y CLOSED NO tienen transición de cancelación', function () {
    $version = Workflow::query()->where('code', 'MANIFEST_UNLOAD')->firstOrFail()->currentVersion;

    expect($version->transitions()->where('from_status_code', 'DRAFT')->where('to_status_code', 'CANCELLED')->exists())->toBeFalse()
        ->and($version->transitions()->where('from_status_code', 'CLOSED')->where('to_status_code', 'CANCELLED')->exists())->toBeFalse();
});

test('NINGUNA transición involucra IN_TRANSIT/RECEIVED (vocabulario compartido exclusivo de manifest_loads)', function () {
    $version = Workflow::query()->where('code', 'MANIFEST_UNLOAD')->firstOrFail()->currentVersion;

    expect($version->transitions()->where('from_status_code', 'IN_TRANSIT')->exists())->toBeFalse()
        ->and($version->transitions()->where('to_status_code', 'IN_TRANSIT')->exists())->toBeFalse()
        ->and($version->transitions()->where('from_status_code', 'RECEIVED')->exists())->toBeFalse()
        ->and($version->transitions()->where('to_status_code', 'RECEIVED')->exists())->toBeFalse();
});

test('registra el workflow_entity_binding de manifest_unloads.manifest_status_id, DISTINTO del de manifest_loads', function () {
    $workflow = Workflow::query()->where('code', 'MANIFEST_UNLOAD')->firstOrFail();

    $binding = WorkflowEntityBinding::query()
        ->where('entity_table', 'manifest_unloads')
        ->where('status_column', 'manifest_status_id')
        ->firstOrFail();

    expect($binding->workflow_id)->toBe($workflow->id)
        ->and($binding->status_catalog_table)->toBe('manifest_statuses');

    $loadBinding = WorkflowEntityBinding::query()
        ->where('entity_table', 'manifest_loads')
        ->where('status_column', 'manifest_status_id')
        ->firstOrFail();

    expect($loadBinding->workflow_id)->not->toBe($binding->workflow_id);
});

test('Workflow::resolveFor("MANIFEST", null, "manifest_unloads") resuelve el workflow correcto (desambiguación por entity_table)', function () {
    $manifestUnloadWorkflow = Workflow::query()->where('code', 'MANIFEST_UNLOAD')->firstOrFail();
    $manifestLoadWorkflow = Workflow::query()->where('code', 'MANIFEST_LOAD')->firstOrFail();

    expect(Workflow::resolveFor('MANIFEST', null, 'manifest_unloads')->id)->toBe($manifestUnloadWorkflow->id)
        ->and(Workflow::resolveFor('MANIFEST', null, 'manifest_loads')->id)->toBe($manifestLoadWorkflow->id);
});
