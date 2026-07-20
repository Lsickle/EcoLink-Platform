<?php

use App\Models\Role;
use App\Models\Workflow;
use App\Models\WorkflowEntityBinding;
use App\Models\WorkflowTransition;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\PlatformOrganizationSeeder;
use Database\Seeders\RoleSeeder;
use Database\Seeders\UnloadRequestWorkflowSeeder;

// Workflow BASE "Solicitud de Descargue" (Fase 4, D-PRG-02) --
// entity_type=TRANSPORT, mismo patrón que TransportScheduleWorkflowSeederTest.

beforeEach(function () {
    $this->seed(OrganizationStatusSeeder::class);
    $this->seed(PlatformOrganizationSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->seed(PermissionSeeder::class);
    $this->seed(UnloadRequestWorkflowSeeder::class);
});

test('crea exactamente un workflow BASE de sistema para TRANSPORT', function () {
    $workflow = Workflow::query()->where('code', 'UNLOAD_REQUEST')->firstOrFail();

    expect($workflow->tenant_organization_id)->toBeNull()
        ->and($workflow->entity_type)->toBe('TRANSPORT')
        ->and($workflow->is_system)->toBeTrue()
        ->and($workflow->is_active)->toBeTrue();
});

test('la versión actual del workflow está PUBLISHED y es la current_version_id', function () {
    $workflow = Workflow::query()->where('code', 'UNLOAD_REQUEST')->firstOrFail();

    expect($workflow->current_version_id)->not->toBeNull();

    $version = $workflow->currentVersion;

    expect($version->status)->toBe('PUBLISHED')
        ->and($version->published_at)->not->toBeNull()
        ->and($version->version_number)->toBe(1);
});

test('el seeder es idempotente (correr dos veces no duplica transiciones ni roles)', function () {
    $transitionsBefore = WorkflowTransition::query()->count();

    $this->seed(UnloadRequestWorkflowSeeder::class);

    expect(Workflow::query()->where('code', 'UNLOAD_REQUEST')->count())->toBe(1)
        ->and(WorkflowTransition::query()->count())->toBe($transitionsBefore);
});

test('siembra exactamente 3 transiciones (DRAFT->SUBMITTED, SUBMITTED->APPROVED, SUBMITTED->REJECTED)', function () {
    $version = Workflow::query()->where('code', 'UNLOAD_REQUEST')->firstOrFail()->currentVersion;

    expect($version->transitions()->count())->toBe(3);
});

dataset('transiciones del grafo autorizadas para LOGÍSTICA', [
    ['DRAFT', 'SUBMITTED'],
    ['SUBMITTED', 'APPROVED'],
    ['SUBMITTED', 'REJECTED'],
]);

test('las transiciones están autorizadas para el rol de sistema LOGÍSTICA', function (string $from, string $to) {
    $logistica = Role::query()->where('code', 'LOGÍSTICA')->firstOrFail();
    $version = Workflow::query()->where('code', 'UNLOAD_REQUEST')->firstOrFail()->currentVersion;

    $transition = $version->transitions()->where('from_status_code', $from)->where('to_status_code', $to)->firstOrFail();

    expect($transition->roles)->toHaveCount(1)
        ->and($transition->roles->first()->role_id)->toBe($logistica->id)
        ->and($transition->roles->first()->business_role_id)->toBeNull();
})->with('transiciones del grafo autorizadas para LOGÍSTICA');

test('no existe transición DRAFT->APPROVED ni ninguna transición de retorno (grafo grueso, sin reapertura)', function () {
    $version = Workflow::query()->where('code', 'UNLOAD_REQUEST')->firstOrFail()->currentVersion;

    expect($version->transitions()->where('from_status_code', 'DRAFT')->where('to_status_code', 'APPROVED')->exists())->toBeFalse()
        ->and($version->transitions()->where('from_status_code', 'APPROVED')->exists())->toBeFalse()
        ->and($version->transitions()->where('from_status_code', 'REJECTED')->exists())->toBeFalse();
});

test('registra el workflow_entity_binding de unload_requests.unload_request_status_id', function () {
    $workflow = Workflow::query()->where('code', 'UNLOAD_REQUEST')->firstOrFail();

    $binding = WorkflowEntityBinding::query()
        ->where('entity_table', 'unload_requests')
        ->where('status_column', 'unload_request_status_id')
        ->firstOrFail();

    expect($binding->workflow_id)->toBe($workflow->id)
        ->and($binding->status_catalog_table)->toBe('unload_request_statuses');
});

test('no colisiona con el workflow TRANSPORT_SCHEDULE (entity_type=SCHEDULING, distinto)', function () {
    $this->seed(\Database\Seeders\TransportStatusSeeder::class);
    $this->seed(\Database\Seeders\TransportScheduleWorkflowSeeder::class);

    $scheduling = Workflow::query()->where('code', 'TRANSPORT_SCHEDULE')->firstOrFail();
    $transport = Workflow::query()->where('code', 'UNLOAD_REQUEST')->firstOrFail();

    expect($scheduling->entity_type)->toBe('SCHEDULING')
        ->and($transport->entity_type)->toBe('TRANSPORT')
        ->and($scheduling->entity_type)->not->toBe($transport->entity_type);

    expect(Workflow::resolveFor('TRANSPORT', null)->code)->toBe('UNLOAD_REQUEST')
        ->and(Workflow::resolveFor('SCHEDULING', null)->code)->toBe('TRANSPORT_SCHEDULE');
});
