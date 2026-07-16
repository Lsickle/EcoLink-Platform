<?php

use App\Models\Organization;
use App\Models\Role;
use App\Models\User;

// Hallazgo Crítico (especialista-seguridad, 2026-07-13, segunda pasada):
// Role::isAccessibleBy() -- semántica DISTINTA a User::isSameTenantAs():
// tenant_organization_id=NULL en un Role es "global", no "mismo grupo que
// actor sin tenant".

test('un rol global (tenant_organization_id NULL) es accesible por CUALQUIER actor', function () {
    $globalRole = Role::factory()->create(['tenant_organization_id' => null]);

    $actorNoTenant = User::factory()->create(['tenant_organization_id' => null]);
    $actorWithTenant = User::factory()->create(['tenant_organization_id' => Organization::factory()->create()->id]);

    expect($globalRole->isAccessibleBy($actorNoTenant))->toBeTrue()
        ->and($globalRole->isAccessibleBy($actorWithTenant))->toBeTrue();
});

test('un rol propio de un tenant solo es accesible por actores de ESE mismo tenant', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $roleOrgA = Role::factory()->create(['tenant_organization_id' => $orgA->id]);

    $actorSameTenant = User::factory()->create(['tenant_organization_id' => $orgA->id]);
    $actorOtherTenant = User::factory()->create(['tenant_organization_id' => $orgB->id]);
    $actorNoTenant = User::factory()->create(['tenant_organization_id' => null]);

    expect($roleOrgA->isAccessibleBy($actorSameTenant))->toBeTrue()
        ->and($roleOrgA->isAccessibleBy($actorOtherTenant))->toBeFalse()
        ->and($roleOrgA->isAccessibleBy($actorNoTenant))->toBeFalse();
});
