<?php

use App\Models\BusinessRole;
use App\Models\Organization;
use App\Models\OrganizationBusinessRole;

// Eje 2 de autorización: Organization::hasCapability() -- condiciona
// acciones futuras (p. ej. solo organizaciones GESTOR pueden aprobar
// tratamientos de residuos) según el tipo de negocio de la organización,
// independiente del RBAC del usuario individual (eje 1).

test('organización con business_role activo que tiene el flag en true -> hasCapability() true', function () {
    $organization = Organization::factory()->create();
    $businessRole = BusinessRole::factory()->create(['code' => 'GESTOR', 'can_approve_treatments' => true]);

    OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id,
        'business_role_id' => $businessRole->id,
        'assigned_at' => now(),
        'is_active' => true,
    ]);

    expect($organization->hasCapability('can_approve_treatments'))->toBeTrue();
});

test('business_role asignado pero el pivote tiene is_active=false -> false', function () {
    $organization = Organization::factory()->create();
    $businessRole = BusinessRole::factory()->create(['code' => 'GESTOR', 'can_approve_treatments' => true]);

    OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id,
        'business_role_id' => $businessRole->id,
        'assigned_at' => now(),
        'is_active' => false,
    ]);

    expect($organization->hasCapability('can_approve_treatments'))->toBeFalse();
});

test('business_roles.is_active=false -> false', function () {
    $organization = Organization::factory()->create();
    $businessRole = BusinessRole::factory()->create(['code' => 'GESTOR', 'can_approve_treatments' => true, 'is_active' => false]);

    OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id,
        'business_role_id' => $businessRole->id,
        'assigned_at' => now(),
        'is_active' => true,
    ]);

    expect($organization->hasCapability('can_approve_treatments'))->toBeFalse();
});

test('organización sin ningún business_role asignado -> false', function () {
    $organization = Organization::factory()->create();

    expect($organization->hasCapability('can_approve_treatments'))->toBeFalse();
});

// Hallazgo Alto (especialista-seguridad 2026-07-14): OrganizationBusinessRole
// ya NO usa SoftDeletes -- BelongsToMany::wherePivot() no aplica su global
// scope, así que un ->delete() sobre este pivote debía borrar la fila de
// verdad (no soft-delete) para que hasCapability() deje de verla de
// inmediato, sin depender de que nadie filtre por deleted_at.
test('borrar el pivote (->delete()) revoca la capacidad de inmediato -- borrado real, no soft-delete', function () {
    $organization = Organization::factory()->create();
    $businessRole = BusinessRole::factory()->create(['code' => 'GESTOR', 'can_approve_treatments' => true]);

    $pivot = OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id,
        'business_role_id' => $businessRole->id,
        'assigned_at' => now(),
        'is_active' => true,
    ]);

    expect($organization->hasCapability('can_approve_treatments'))->toBeTrue();

    $pivot->delete();

    expect($organization->hasCapability('can_approve_treatments'))->toBeFalse()
        ->and(OrganizationBusinessRole::withoutGlobalScopes()->count())->toBe(0);
});

test('flag desconocido lanza InvalidArgumentException', function () {
    $organization = Organization::factory()->create();

    $organization->hasCapability('flag_inexistente');
})->throws(InvalidArgumentException::class);

test('organización con 2 business_roles (GENERATOR + TRANSPORTER) -> cada capacidad true por el rol correspondiente', function () {
    $organization = Organization::factory()->create();
    $generator = BusinessRole::factory()->create(['code' => 'GENERATOR', 'can_generate_waste' => true]);
    $transporter = BusinessRole::factory()->create(['code' => 'TRANSPORTER', 'can_transport_waste' => true]);

    OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id,
        'business_role_id' => $generator->id,
        'assigned_at' => now(),
        'is_active' => true,
    ]);
    OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id,
        'business_role_id' => $transporter->id,
        'assigned_at' => now(),
        'is_active' => true,
    ]);

    expect($organization->hasCapability('can_generate_waste'))->toBeTrue()
        ->and($organization->hasCapability('can_transport_waste'))->toBeTrue()
        ->and($organization->hasCapability('can_treat_waste'))->toBeFalse();
});
