<?php

use App\Models\BusinessRole;
use App\Models\Organization;
use App\Models\OrganizationBusinessRole;
use App\Models\SecurityLog;

// Eje 2 de autorización: comando Artisan para asignar un business_role a
// una organización -- no hay endpoint HTTP todavía (fuera de alcance, sin
// módulo operativo que lo consuma). Mismo set de casos que
// AssignRoleCommandTest (eje 1).

test('organization:assign-business-role asigna el business_role y registra el evento', function () {
    $organization = Organization::factory()->create();
    $businessRole = BusinessRole::factory()->create(['code' => 'GESTOR']);

    $this->artisan('organization:assign-business-role', ['organization_id' => $organization->id, 'code' => 'GESTOR', '--force' => true])
        ->expectsOutputToContain('asignado correctamente')
        ->assertExitCode(0);

    expect(OrganizationBusinessRole::query()->where('organization_id', $organization->id)->where('business_role_id', $businessRole->id)->where('is_active', true)->exists())->toBeTrue();

    $log = SecurityLog::query()->where('event_type', 'BUSINESS_ROLE_ASSIGNED_CONSOLE')->first();
    expect($log)->not->toBeNull()->and($log->tenant_organization_id)->toBe($organization->id);
});

test('organization:assign-business-role acepta el código en minúsculas', function () {
    $organization = Organization::factory()->create();
    $businessRole = BusinessRole::factory()->create(['code' => 'GESTOR']);

    $this->artisan('organization:assign-business-role', ['organization_id' => $organization->id, 'code' => 'gestor', '--force' => true])
        ->assertExitCode(0);

    expect(OrganizationBusinessRole::query()->where('organization_id', $organization->id)->where('business_role_id', $businessRole->id)->exists())->toBeTrue();
});

test('organization:assign-business-role informa si la organización no existe', function () {
    BusinessRole::factory()->create(['code' => 'GESTOR']);

    $this->artisan('organization:assign-business-role', ['organization_id' => 999999, 'code' => 'GESTOR', '--force' => true])
        ->expectsOutputToContain('No se encontró ninguna organización')
        ->assertExitCode(1);
});

test('organization:assign-business-role informa si el código no existe', function () {
    $organization = Organization::factory()->create();

    $this->artisan('organization:assign-business-role', ['organization_id' => $organization->id, 'code' => 'NO_EXISTE', '--force' => true])
        ->expectsOutputToContain('No se encontró ningún business_role')
        ->assertExitCode(1);
});

test('organization:assign-business-role no duplica la asignación si ya existe', function () {
    $organization = Organization::factory()->create();
    $businessRole = BusinessRole::factory()->create(['code' => 'GESTOR']);
    OrganizationBusinessRole::query()->create(['organization_id' => $organization->id, 'business_role_id' => $businessRole->id, 'assigned_at' => now(), 'is_active' => true]);

    $this->artisan('organization:assign-business-role', ['organization_id' => $organization->id, 'code' => 'GESTOR', '--force' => true])
        ->expectsOutputToContain('ya tiene asignado')
        ->assertExitCode(0);

    expect(OrganizationBusinessRole::query()->where('organization_id', $organization->id)->where('business_role_id', $businessRole->id)->count())->toBe(1);
});

// Hallazgo Medio (especialista-seguridad 2026-07-14): risk_level dinámico
// según los flags del business_role asignado, no hardcoded a LOW.
test('organization:assign-business-role registra risk_level HIGH cuando el business_role puede aprobar tratamientos', function () {
    $organization = Organization::factory()->create();
    BusinessRole::factory()->create(['code' => 'GESTOR', 'can_approve_treatments' => true]);

    $this->artisan('organization:assign-business-role', ['organization_id' => $organization->id, 'code' => 'GESTOR', '--force' => true])
        ->assertExitCode(0);

    $log = SecurityLog::query()->where('event_type', 'BUSINESS_ROLE_ASSIGNED_CONSOLE')->first();
    expect($log->risk_level)->toBe('HIGH');
});

test('organization:assign-business-role registra risk_level HIGH cuando el business_role puede emitir manifiestos', function () {
    $organization = Organization::factory()->create();
    BusinessRole::factory()->create(['code' => 'GESTOR', 'can_issue_manifests' => true]);

    $this->artisan('organization:assign-business-role', ['organization_id' => $organization->id, 'code' => 'GESTOR', '--force' => true])
        ->assertExitCode(0);

    $log = SecurityLog::query()->where('event_type', 'BUSINESS_ROLE_ASSIGNED_CONSOLE')->first();
    expect($log->risk_level)->toBe('HIGH');
});

test('organization:assign-business-role registra risk_level HIGH cuando el business_role puede emitir certificados de disposición', function () {
    $organization = Organization::factory()->create();
    BusinessRole::factory()->create(['code' => 'GESTOR', 'can_issue_disposal_certificates' => true]);

    $this->artisan('organization:assign-business-role', ['organization_id' => $organization->id, 'code' => 'GESTOR', '--force' => true])
        ->assertExitCode(0);

    $log = SecurityLog::query()->where('event_type', 'BUSINESS_ROLE_ASSIGNED_CONSOLE')->first();
    expect($log->risk_level)->toBe('HIGH');
});

test('organization:assign-business-role registra risk_level MEDIUM cuando el business_role solo transporta residuos', function () {
    $organization = Organization::factory()->create();
    BusinessRole::factory()->create(['code' => 'TRANSPORTER', 'can_transport_waste' => true, 'requires_transport_authorization' => true]);

    $this->artisan('organization:assign-business-role', ['organization_id' => $organization->id, 'code' => 'TRANSPORTER', '--force' => true])
        ->assertExitCode(0);

    $log = SecurityLog::query()->where('event_type', 'BUSINESS_ROLE_ASSIGNED_CONSOLE')->first();
    expect($log->risk_level)->toBe('MEDIUM');
});

test('organization:assign-business-role registra risk_level LOW cuando el business_role no tiene ningún flag en true', function () {
    $organization = Organization::factory()->create();
    BusinessRole::factory()->create(['code' => 'COMERCIALIZADOR']);

    $this->artisan('organization:assign-business-role', ['organization_id' => $organization->id, 'code' => 'COMERCIALIZADOR', '--force' => true])
        ->assertExitCode(0);

    $log = SecurityLog::query()->where('event_type', 'BUSINESS_ROLE_ASSIGNED_CONSOLE')->first();
    expect($log->risk_level)->toBe('LOW');
});

test('organization:assign-business-role pide confirmación y no asigna si la respuesta es no', function () {
    $organization = Organization::factory()->create();
    $businessRole = BusinessRole::factory()->create(['code' => 'GESTOR']);

    $this->artisan('organization:assign-business-role', ['organization_id' => $organization->id, 'code' => 'GESTOR'])
        ->expectsConfirmation("¿Confirmas asignar el business_role 'GESTOR' a la organización '{$organization->legal_name}' (id {$organization->id})?", 'no')
        ->assertExitCode(1);

    expect(OrganizationBusinessRole::query()->where('organization_id', $organization->id)->where('business_role_id', $businessRole->id)->exists())->toBeFalse();
});
