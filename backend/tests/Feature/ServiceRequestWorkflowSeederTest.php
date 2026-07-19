<?php

use App\Models\BusinessRole;
use App\Models\Role;
use App\Models\Workflow;
use App\Models\WorkflowEntityBinding;
use App\Models\WorkflowTransition;
use Database\Seeders\BusinessRoleSeeder;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\PlatformOrganizationSeeder;
use Database\Seeders\RoleSeeder;
use Database\Seeders\ServiceRequestWorkflowSeeder;

// Workflow BASE "Solicitud de Servicio" (D-S02/D-S13/D-S23/D-S25) --
// entity_type=SERVICE, mismo patrón que WorkflowSeederTest (RESPEL).

beforeEach(function () {
    $this->seed(OrganizationStatusSeeder::class);
    $this->seed(PlatformOrganizationSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->seed(PermissionSeeder::class);
    $this->seed(BusinessRoleSeeder::class);
    $this->seed(ServiceRequestWorkflowSeeder::class);
});

test('crea exactamente un workflow BASE de sistema para SERVICE', function () {
    $workflow = Workflow::query()->where('code', 'SERVICE_REQUEST')->firstOrFail();

    expect($workflow->tenant_organization_id)->toBeNull()
        ->and($workflow->entity_type)->toBe('SERVICE')
        ->and($workflow->is_system)->toBeTrue()
        ->and($workflow->is_active)->toBeTrue();
});

test('la versión actual del workflow está PUBLISHED y es la current_version_id', function () {
    $workflow = Workflow::query()->where('code', 'SERVICE_REQUEST')->firstOrFail();

    expect($workflow->current_version_id)->not->toBeNull();

    $version = $workflow->currentVersion;

    expect($version->status)->toBe('PUBLISHED')
        ->and($version->published_at)->not->toBeNull()
        ->and($version->version_number)->toBe(1);
});

test('el seeder es idempotente (correr dos veces no duplica transiciones ni roles)', function () {
    $transitionsBefore = WorkflowTransition::query()->count();

    $this->seed(ServiceRequestWorkflowSeeder::class);

    expect(Workflow::query()->where('code', 'SERVICE_REQUEST')->count())->toBe(1)
        ->and(WorkflowTransition::query()->count())->toBe($transitionsBefore);
});

test('siembra exactamente 14 transiciones (1 submit + 1 automática + 2 revisión + 1 reapertura + 3 placeholder + 6 cancelación)', function () {
    $version = Workflow::query()->where('code', 'SERVICE_REQUEST')->firstOrFail()->currentVersion;

    expect($version->transitions()->count())->toBe(14);
});

test('DRAFT -> SUBMITTED solo está autorizada para business_role GENERATOR', function () {
    $generator = BusinessRole::query()->where('code', 'GENERATOR')->firstOrFail();
    $version = Workflow::query()->where('code', 'SERVICE_REQUEST')->firstOrFail()->currentVersion;

    $transition = $version->transitions()->where('from_status_code', 'DRAFT')->where('to_status_code', 'SUBMITTED')->firstOrFail();

    expect($transition->is_automatic)->toBeFalse()
        ->and($transition->roles)->toHaveCount(1)
        ->and($transition->roles->first()->business_role_id)->toBe($generator->id)
        ->and($transition->roles->first()->role_id)->toBeNull();
});

test('SUBMITTED -> UNDER_REVIEW es automática, sin roles asignados', function () {
    $version = Workflow::query()->where('code', 'SERVICE_REQUEST')->firstOrFail()->currentVersion;

    $transition = $version->transitions()->where('from_status_code', 'SUBMITTED')->where('to_status_code', 'UNDER_REVIEW')->firstOrFail();

    expect($transition->is_automatic)->toBeTrue()
        ->and($transition->roles)->toHaveCount(0);
});

dataset('transiciones de revisión por GESTOR', [
    ['UNDER_REVIEW', 'APPROVED'],
    ['UNDER_REVIEW', 'REJECTED'],
]);

test('la aprobación/rechazo de cabecera está autorizada para business_role GESTOR (D-S25)', function (string $from, string $to) {
    $gestor = BusinessRole::query()->where('code', 'GESTOR')->firstOrFail();
    $version = Workflow::query()->where('code', 'SERVICE_REQUEST')->firstOrFail()->currentVersion;

    $transition = $version->transitions()->where('from_status_code', $from)->where('to_status_code', $to)->firstOrFail();

    expect($transition->roles)->toHaveCount(1)
        ->and($transition->roles->first()->business_role_id)->toBe($gestor->id);
})->with('transiciones de revisión por GESTOR');

test('REJECTED -> DRAFT (reapertura, D-S23) requiere aprobación y está autorizada para GENERATOR', function () {
    $generator = BusinessRole::query()->where('code', 'GENERATOR')->firstOrFail();
    $version = Workflow::query()->where('code', 'SERVICE_REQUEST')->firstOrFail()->currentVersion;

    $transition = $version->transitions()->where('from_status_code', 'REJECTED')->where('to_status_code', 'DRAFT')->firstOrFail();

    expect($transition->requires_approval)->toBeTrue()
        ->and($transition->roles->first()->business_role_id)->toBe($generator->id);
});

dataset('estados no-finales que pueden cancelarse', [
    ['DRAFT'], ['SUBMITTED'], ['UNDER_REVIEW'], ['APPROVED'], ['SCHEDULED'], ['IN_EXECUTION'],
]);

test('CANCELLED es alcanzable desde cada estado no-final, autorizado para GENERATOR (D-S25)', function (string $from) {
    $generator = BusinessRole::query()->where('code', 'GENERATOR')->firstOrFail();
    $version = Workflow::query()->where('code', 'SERVICE_REQUEST')->firstOrFail()->currentVersion;

    $transition = $version->transitions()->where('from_status_code', $from)->where('to_status_code', 'CANCELLED')->firstOrFail();

    expect($transition->roles->first()->business_role_id)->toBe($generator->id);
})->with('estados no-finales que pueden cancelarse');

dataset('transiciones placeholder de Programación/Dispatch', [
    ['APPROVED', 'SCHEDULED'],
    ['SCHEDULED', 'IN_EXECUTION'],
    ['IN_EXECUTION', 'COMPLETED'],
]);

test('las transiciones placeholder de Programación/Dispatch quedan autorizadas para ADMINISTRADOR', function (string $from, string $to) {
    $administrador = Role::query()->where('code', 'ADMINISTRADOR')->firstOrFail();
    $version = Workflow::query()->where('code', 'SERVICE_REQUEST')->firstOrFail()->currentVersion;

    $transition = $version->transitions()->where('from_status_code', $from)->where('to_status_code', $to)->firstOrFail();

    expect($transition->roles->first()->role_id)->toBe($administrador->id)
        ->and($transition->roles->first()->business_role_id)->toBeNull();
})->with('transiciones placeholder de Programación/Dispatch');

test('registra el workflow_entity_binding de waste_service_requests.service_status_id', function () {
    $workflow = Workflow::query()->where('code', 'SERVICE_REQUEST')->firstOrFail();

    $binding = WorkflowEntityBinding::query()
        ->where('entity_table', 'waste_service_requests')
        ->where('status_column', 'service_status_id')
        ->firstOrFail();

    expect($binding->workflow_id)->toBe($workflow->id)
        ->and($binding->status_catalog_table)->toBe('service_statuses');
});
