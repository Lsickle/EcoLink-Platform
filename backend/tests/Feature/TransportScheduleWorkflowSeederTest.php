<?php

use App\Models\Role;
use App\Models\Workflow;
use App\Models\WorkflowEntityBinding;
use App\Models\WorkflowTransition;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\PlatformOrganizationSeeder;
use Database\Seeders\RoleSeeder;
use Database\Seeders\TransportScheduleWorkflowSeeder;

// Workflow BASE "Programación de Transporte" (D-PRG-01 a D-PRG-14) --
// entity_type=SCHEDULING, mismo patrón que WorkflowSeederTest (RESPEL) y
// ServiceRequestWorkflowSeederTest (SERVICE_REQUEST).

beforeEach(function () {
    $this->seed(OrganizationStatusSeeder::class);
    $this->seed(PlatformOrganizationSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->seed(PermissionSeeder::class);
    $this->seed(TransportScheduleWorkflowSeeder::class);
});

test('crea exactamente un workflow BASE de sistema para SCHEDULING', function () {
    $workflow = Workflow::query()->where('code', 'TRANSPORT_SCHEDULE')->firstOrFail();

    expect($workflow->tenant_organization_id)->toBeNull()
        ->and($workflow->entity_type)->toBe('SCHEDULING')
        ->and($workflow->is_system)->toBeTrue()
        ->and($workflow->is_active)->toBeTrue();
});

test('la versión actual del workflow está PUBLISHED y es la current_version_id', function () {
    $workflow = Workflow::query()->where('code', 'TRANSPORT_SCHEDULE')->firstOrFail();

    expect($workflow->current_version_id)->not->toBeNull();

    $version = $workflow->currentVersion;

    expect($version->status)->toBe('PUBLISHED')
        ->and($version->published_at)->not->toBeNull()
        ->and($version->version_number)->toBe(1);
});

test('el seeder es idempotente (correr dos veces no duplica transiciones ni roles)', function () {
    $transitionsBefore = WorkflowTransition::query()->count();

    $this->seed(TransportScheduleWorkflowSeeder::class);

    expect(Workflow::query()->where('code', 'TRANSPORT_SCHEDULE')->count())->toBe(1)
        ->and(WorkflowTransition::query()->count())->toBe($transitionsBefore);
});

test('siembra exactamente 9 transiciones (3 del grafo principal + 2 placeholder de ejecución + 4 de cancelación)', function () {
    $version = Workflow::query()->where('code', 'TRANSPORT_SCHEDULE')->firstOrFail()->currentVersion;

    expect($version->transitions()->count())->toBe(9);
});

dataset('transiciones del grafo principal autorizadas para LOGÍSTICA', [
    ['BOR', 'PEND'],
    ['PEND', 'PROG'],
    ['PROG', 'CONF'],
]);

test('las transiciones del grafo principal están autorizadas para el rol de sistema LOGÍSTICA (D-PRG-14)', function (string $from, string $to) {
    $logistica = Role::query()->where('code', 'LOGÍSTICA')->firstOrFail();
    $version = Workflow::query()->where('code', 'TRANSPORT_SCHEDULE')->firstOrFail()->currentVersion;

    $transition = $version->transitions()->where('from_status_code', $from)->where('to_status_code', $to)->firstOrFail();

    expect($transition->roles)->toHaveCount(1)
        ->and($transition->roles->first()->role_id)->toBe($logistica->id)
        ->and($transition->roles->first()->business_role_id)->toBeNull();
})->with('transiciones del grafo principal autorizadas para LOGÍSTICA');

dataset('transiciones placeholder de ejecución de transporte', [
    ['CONF', 'EJEC'],
    ['EJEC', 'FIN'],
]);

test('las transiciones placeholder de ejecución de transporte quedan autorizadas para ADMINISTRADOR', function (string $from, string $to) {
    $administrador = Role::query()->where('code', 'ADMINISTRADOR')->firstOrFail();
    $version = Workflow::query()->where('code', 'TRANSPORT_SCHEDULE')->firstOrFail()->currentVersion;

    $transition = $version->transitions()->where('from_status_code', $from)->where('to_status_code', $to)->firstOrFail();

    expect($transition->roles->first()->role_id)->toBe($administrador->id)
        ->and($transition->roles->first()->business_role_id)->toBeNull();
})->with('transiciones placeholder de ejecución de transporte');

dataset('estados no-operativos desde los que se puede cancelar', [
    ['BOR'], ['PEND'], ['PROG'], ['CONF'],
]);

test('CANC es alcanzable desde cada estado no-operativo, autorizado para LOGÍSTICA (CU-028)', function (string $from) {
    $logistica = Role::query()->where('code', 'LOGÍSTICA')->firstOrFail();
    $version = Workflow::query()->where('code', 'TRANSPORT_SCHEDULE')->firstOrFail()->currentVersion;

    $transition = $version->transitions()->where('from_status_code', $from)->where('to_status_code', 'CANC')->firstOrFail();

    expect($transition->roles->first()->role_id)->toBe($logistica->id);
})->with('estados no-operativos desde los que se puede cancelar');

test('EJEC y FIN no tienen transición de cancelación (fuera de alcance de CU-028)', function () {
    $version = Workflow::query()->where('code', 'TRANSPORT_SCHEDULE')->firstOrFail()->currentVersion;

    expect($version->transitions()->where('from_status_code', 'EJEC')->where('to_status_code', 'CANC')->exists())->toBeFalse()
        ->and($version->transitions()->where('from_status_code', 'FIN')->where('to_status_code', 'CANC')->exists())->toBeFalse();
});

test('registra el workflow_entity_binding de transport_schedules.transport_status_id', function () {
    $workflow = Workflow::query()->where('code', 'TRANSPORT_SCHEDULE')->firstOrFail();

    $binding = WorkflowEntityBinding::query()
        ->where('entity_table', 'transport_schedules')
        ->where('status_column', 'transport_status_id')
        ->firstOrFail();

    expect($binding->workflow_id)->toBe($workflow->id)
        ->and($binding->status_catalog_table)->toBe('transport_statuses');
});
