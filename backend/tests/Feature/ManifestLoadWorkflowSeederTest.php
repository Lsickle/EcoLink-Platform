<?php

use App\Models\Role;
use App\Models\Workflow;
use App\Models\WorkflowEntityBinding;
use App\Models\WorkflowTransition;
use Database\Seeders\ManifestLoadWorkflowSeeder;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\PlatformOrganizationSeeder;
use Database\Seeders\RoleSeeder;

// Workflow BASE "Manifiesto de Cargue" (Fase 3) -- entity_type=MANIFEST,
// mismo patrón que TransportScheduleWorkflowSeederTest.

beforeEach(function () {
    $this->seed(OrganizationStatusSeeder::class);
    $this->seed(PlatformOrganizationSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->seed(PermissionSeeder::class);
    $this->seed(ManifestLoadWorkflowSeeder::class);
});

test('crea exactamente un workflow BASE de sistema para MANIFEST', function () {
    $workflow = Workflow::query()->where('code', 'MANIFEST_LOAD')->firstOrFail();

    expect($workflow->tenant_organization_id)->toBeNull()
        ->and($workflow->entity_type)->toBe('MANIFEST')
        ->and($workflow->is_system)->toBeTrue()
        ->and($workflow->is_active)->toBeTrue();
});

test('la versión actual del workflow está PUBLISHED y es la current_version_id', function () {
    $workflow = Workflow::query()->where('code', 'MANIFEST_LOAD')->firstOrFail();

    expect($workflow->current_version_id)->not->toBeNull();

    $version = $workflow->currentVersion;

    expect($version->status)->toBe('PUBLISHED')
        ->and($version->published_at)->not->toBeNull()
        ->and($version->version_number)->toBe(1);
});

test('el seeder es idempotente (correr dos veces no duplica transiciones ni roles)', function () {
    $transitionsBefore = WorkflowTransition::query()->count();

    $this->seed(ManifestLoadWorkflowSeeder::class);

    expect(Workflow::query()->where('code', 'MANIFEST_LOAD')->count())->toBe(1)
        ->and(WorkflowTransition::query()->count())->toBe($transitionsBefore);
});

test('siembra exactamente 6 transiciones (2 humanas del grafo principal + 2 automáticas de firma + 2 de cancelación)', function () {
    $version = Workflow::query()->where('code', 'MANIFEST_LOAD')->firstOrFail()->currentVersion;

    expect($version->transitions()->count())->toBe(6);
});

dataset('transiciones humanas autorizadas para LOGÍSTICA', [
    ['DRAFT', 'GENERATED'],
    ['SIGNED', 'IN_TRANSIT'],
]);

test('las transiciones humanas están autorizadas para el rol de sistema LOGÍSTICA', function (string $from, string $to) {
    $logistica = Role::query()->where('code', 'LOGÍSTICA')->firstOrFail();
    $version = Workflow::query()->where('code', 'MANIFEST_LOAD')->firstOrFail()->currentVersion;

    $transition = $version->transitions()->where('from_status_code', $from)->where('to_status_code', $to)->firstOrFail();

    expect($transition->roles)->toHaveCount(1)
        ->and($transition->roles->first()->role_id)->toBe($logistica->id)
        ->and($transition->roles->first()->business_role_id)->toBeNull();
})->with('transiciones humanas autorizadas para LOGÍSTICA');

dataset('transiciones automáticas disparadas por la firma', [
    ['GENERATED', 'PARTIALLY_SIGNED'],
    ['PARTIALLY_SIGNED', 'SIGNED'],
]);

test('las transiciones automáticas de firma NO tienen workflow_transition_roles (sin restricción, validado por ManifestLoadSignatureService)', function (string $from, string $to) {
    $version = Workflow::query()->where('code', 'MANIFEST_LOAD')->firstOrFail()->currentVersion;

    $transition = $version->transitions()->where('from_status_code', $from)->where('to_status_code', $to)->firstOrFail();

    expect($transition->is_automatic)->toBeTrue()
        ->and($transition->roles)->toHaveCount(0);
})->with('transiciones automáticas disparadas por la firma');

dataset('estados desde los que se puede cancelar', [
    ['GENERATED'], ['PARTIALLY_SIGNED'],
]);

test('CANCELLED es alcanzable desde Generated/PartiallySigned, autorizado para LOGÍSTICA', function (string $from) {
    $logistica = Role::query()->where('code', 'LOGÍSTICA')->firstOrFail();
    $version = Workflow::query()->where('code', 'MANIFEST_LOAD')->firstOrFail()->currentVersion;

    $transition = $version->transitions()->where('from_status_code', $from)->where('to_status_code', 'CANCELLED')->firstOrFail();

    expect($transition->roles->first()->role_id)->toBe($logistica->id);
})->with('estados desde los que se puede cancelar');

test('DRAFT, SIGNED e IN_TRANSIT NO tienen transición de cancelación (RN de esta tarea)', function () {
    $version = Workflow::query()->where('code', 'MANIFEST_LOAD')->firstOrFail()->currentVersion;

    expect($version->transitions()->where('from_status_code', 'DRAFT')->where('to_status_code', 'CANCELLED')->exists())->toBeFalse()
        ->and($version->transitions()->where('from_status_code', 'SIGNED')->where('to_status_code', 'CANCELLED')->exists())->toBeFalse()
        ->and($version->transitions()->where('from_status_code', 'IN_TRANSIT')->where('to_status_code', 'CANCELLED')->exists())->toBeFalse();
});

test('NINGUNA transición apunta a RECEIVED/CLOSED (alcance diferido a manifest_unloads, Fase 5)', function () {
    $version = Workflow::query()->where('code', 'MANIFEST_LOAD')->firstOrFail()->currentVersion;

    expect($version->transitions()->where('to_status_code', 'RECEIVED')->exists())->toBeFalse()
        ->and($version->transitions()->where('to_status_code', 'CLOSED')->exists())->toBeFalse();
});

test('registra el workflow_entity_binding de manifest_loads.manifest_status_id', function () {
    $workflow = Workflow::query()->where('code', 'MANIFEST_LOAD')->firstOrFail();

    $binding = WorkflowEntityBinding::query()
        ->where('entity_table', 'manifest_loads')
        ->where('status_column', 'manifest_status_id')
        ->firstOrFail();

    expect($binding->workflow_id)->toBe($workflow->id)
        ->and($binding->status_catalog_table)->toBe('manifest_statuses');
});
