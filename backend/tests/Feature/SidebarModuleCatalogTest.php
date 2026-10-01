<?php

use App\Models\Organization;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserRole;

// GET /api/admin/sidebar-modules -- catálogo de los 7 grupos temáticos en los
// que se reorganizó el sidebar del frontend, habilitables por organización
// individual (ver SidebarModuleController). Las 7 filas ya existen en
// cualquier entorno de test gracias a la migración de backfill
// `2026_09_28_000003_backfill_organization_sidebar_modules_table`, que corre
// como parte de RefreshDatabase -- sin necesidad de seeder aquí.

function platformStaffActorForSidebarModules(): User
{
    $platform = Organization::query()->where('is_platform_tenant', true)->first()
        ?? Organization::factory()->create(['is_platform_tenant' => true]);

    return User::factory()->create(['tenant_organization_id' => $platform->id]);
}

test('GET /api/admin/sidebar-modules devuelve 200 con los 7 códigos para platform staff', function () {
    $actor = platformStaffActorForSidebarModules();

    $response = $this->actingAs($actor)->getJson('/api/admin/sidebar-modules')->assertOk();

    $codes = collect($response->json('data'))->pluck('code')->all();

    expect($codes)->toBe([
        'ORGANIZACION', 'RESIDUOS', 'SERVICIOS', 'LOGISTICA', 'OPERACIONES', 'CERTIFICADOS', 'ADMINISTRACION',
    ]);
});

test('GET /api/admin/sidebar-modules devuelve 403 para un usuario normal aunque tenga permisos RBAC amplios -- el gate es is_platform_staff, no un permiso', function () {
    $tenant = Organization::factory()->create();
    $actor = User::factory()->create(['tenant_organization_id' => $tenant->id]);

    $role = Role::factory()->create();
    Permission::factory()->count(5)->create()->each(function (Permission $permission) use ($role) {
        RolePermission::query()->create(['role_id' => $role->id, 'permission_id' => $permission->id, 'is_active' => true]);
    });
    UserRole::query()->create(['user_id' => $actor->id, 'role_id' => $role->id, 'is_active' => true]);

    $this->actingAs($actor)->getJson('/api/admin/sidebar-modules')->assertForbidden();
});
