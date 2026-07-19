<?php

use App\Models\Role;
use App\Models\Workflow;
use App\Models\WorkflowTransition;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\PlatformOrganizationSeeder;
use Database\Seeders\RespelStatusSeeder;
use Database\Seeders\RoleSeeder;
use Database\Seeders\WorkflowSeeder;

// Workflow BASE "RESPEL" -- replica EXACTAMENTE las transiciones que
// WasteTreatmentApprovalController permite hoy (comparado contra
// TERMINAL_COMMERCIAL_STATUSES y los métodos approveTechnical/
// rejectTechnical/approveCommercial/rejectCommercial/quote/negotiate/cancel).

beforeEach(function () {
    $this->seed(OrganizationStatusSeeder::class);
    $this->seed(PlatformOrganizationSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->seed(PermissionSeeder::class);
    $this->seed(RespelStatusSeeder::class);
    $this->seed(WorkflowSeeder::class);
});

test('crea exactamente un workflow BASE de sistema para TREATMENT', function () {
    expect(Workflow::query()->count())->toBe(1);

    $workflow = Workflow::query()->where('code', 'RESPEL')->firstOrFail();

    expect($workflow->tenant_organization_id)->toBeNull()
        ->and($workflow->entity_type)->toBe('TREATMENT')
        ->and($workflow->is_system)->toBeTrue()
        ->and($workflow->is_active)->toBeTrue();
});

test('la versión actual del workflow está PUBLISHED y es la current_version_id', function () {
    $workflow = Workflow::query()->where('code', 'RESPEL')->firstOrFail();

    expect($workflow->current_version_id)->not->toBeNull();

    $version = $workflow->currentVersion;

    expect($version->status)->toBe('PUBLISHED')
        ->and($version->published_at)->not->toBeNull()
        ->and($version->version_number)->toBe(1);
});

test('el seeder es idempotente (correr dos veces no duplica transiciones ni roles)', function () {
    $transitionsBefore = WorkflowTransition::query()->count();

    $this->seed(WorkflowSeeder::class);

    expect(Workflow::query()->count())->toBe(1)
        ->and(WorkflowTransition::query()->count())->toBe($transitionsBefore);
});

test('siembra las 3 transiciones técnicas exactas desde TECH_PENDING', function () {
    $version = Workflow::query()->where('code', 'RESPEL')->firstOrFail()->currentVersion;

    $technicalTransitions = $version->transitions()
        ->where('from_status_code', 'TECH_PENDING')
        ->pluck('to_status_code')
        ->sort()
        ->values()
        ->all();

    expect($technicalTransitions)->toBe(['TECH_APPROVED', 'TECH_REJECTED', 'TECH_RESTRICTED']);
});

test('ninguna transición técnica sale de un estado distinto a TECH_PENDING (todos los destinos son finales)', function () {
    $version = Workflow::query()->where('code', 'RESPEL')->firstOrFail()->currentVersion;

    $fromCodes = $version->transitions()
        ->where('to_status_code', 'like', 'TECH_%')
        ->pluck('from_status_code')
        ->unique();

    expect($fromCodes->all())->toBe(['TECH_PENDING']);
});

dataset('transiciones comerciales esperadas', [
    ['COM_DRAFT', 'COM_QUOTED', false],
    ['COM_DRAFT', 'COM_NEGOTIATING', false],
    ['COM_QUOTED', 'COM_NEGOTIATING', false],
    ['COM_DRAFT', 'COM_APPROVED', false],
    ['COM_QUOTED', 'COM_APPROVED', false],
    ['COM_NEGOTIATING', 'COM_APPROVED', false],
    ['COM_DRAFT', 'COM_REJECTED', false],
    ['COM_QUOTED', 'COM_REJECTED', false],
    ['COM_NEGOTIATING', 'COM_REJECTED', false],
    ['COM_DRAFT', 'COM_CANCELLED', false],
    ['COM_QUOTED', 'COM_CANCELLED', false],
    ['COM_NEGOTIATING', 'COM_CANCELLED', false],
    ['COM_APPROVED', 'COM_CANCELLED', true],
    ['COM_REJECTED', 'COM_CANCELLED', true],
]);

test('cada transición comercial existe con el requires_approval correcto', function (string $from, string $to, bool $requiresApproval) {
    $version = Workflow::query()->where('code', 'RESPEL')->firstOrFail()->currentVersion;

    $transition = $version->transitions()->where('from_status_code', $from)->where('to_status_code', $to)->first();

    expect($transition)->not->toBeNull()
        ->and($transition->requires_approval)->toBe($requiresApproval)
        ->and($transition->is_automatic)->toBeFalse();
})->with('transiciones comerciales esperadas');

test('siembra exactamente 17 transiciones en total (3 técnicas + 14 comerciales)', function () {
    $version = Workflow::query()->where('code', 'RESPEL')->firstOrFail()->currentVersion;

    expect($version->transitions()->count())->toBe(17);
});

test('todas las transiciones están autorizadas SOLO para ADMINISTRADOR (mismo permiso único treatment_approvals.evaluate del controller)', function () {
    $administrador = Role::query()->where('code', 'ADMINISTRADOR')->firstOrFail();
    $version = Workflow::query()->where('code', 'RESPEL')->firstOrFail()->currentVersion;

    $transitions = $version->transitions()->with('roles')->get();

    expect($transitions)->toHaveCount(17);

    foreach ($transitions as $transition) {
        expect($transition->roles)->toHaveCount(1);
        expect($transition->roles->first()->role_id)->toBe($administrador->id);
        expect($transition->roles->first()->business_role_id)->toBeNull();
    }
});
