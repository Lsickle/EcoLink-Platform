<?php

use App\Models\Organization;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserRole;

// Actor propio (no se reutiliza `wasteActor()` de WasteControllerTest.php:
// las funciones declaradas en un archivo de test no están garantizadas como
// disponibles en otro, depende del orden de carga).
function localizationActor(string $permissionCode, int $tenantOrganizationId): User
{
    $actor = User::factory()->create(['tenant_organization_id' => $tenantOrganizationId]);
    $role = Role::factory()->create();

    $permission = Permission::query()->firstOrCreate(['code' => $permissionCode], [
        'name' => $permissionCode,
        'module' => explode('.', $permissionCode)[0],
        'action' => explode('.', $permissionCode)[1] ?? $permissionCode,
        'scope' => 'tenant',
        'is_system' => true,
        'is_active' => true,
    ]);

    RolePermission::query()->create(['role_id' => $role->id, 'permission_id' => $permission->id, 'is_active' => true]);
    UserRole::query()->create(['user_id' => $actor->id, 'role_id' => $role->id, 'is_active' => true]);

    return $actor;
}

// Reporte del usuario (2026-08-13): en el wizard de Residuos, al pasar del
// paso 1 al 2 sin llenar nada, aparecía "The name field is required" en
// inglés. Causa: `APP_LOCALE=en` y Laravel no trae traducciones al español
// (no existía `lang/`). Como `lib/api-client.ts` muestra tal cual el
// `message`/`errors` del 422, traducir la capa de validación lo resuelve en
// TODOS los wizards y formularios a la vez -- de ahí que esto se pruebe como
// comportamiento transversal y no dentro del test de un módulo.

test('el idioma por defecto es español aunque no esté definida la variable de entorno', function () {
    expect(config('app.locale'))->toBe('es')
        ->and(config('app.fallback_locale'))->toBe('es');
});

test('los mensajes de validación llegan en español, no en inglés', function () {
    expect(__('validation.required', ['attribute' => 'nombre']))
        ->toBe('El campo nombre es obligatorio.')
        ->not->toContain('field is required');
});

test('el nombre del campo también se traduce (:attribute), no queda en inglés dentro del mensaje', function () {
    // Sin el bloque `attributes` el mensaje quedaría a medias: "El campo name
    // es obligatorio."
    expect(__('validation.attributes.name'))->toBe('nombre')
        ->and(__('validation.attributes.organization_id'))->toBe('organización')
        ->and(__('validation.attributes.waste_category_id'))->toBe('categoría de residuo');
});

// El caso EXACTO reportado: paso 1 del wizard de Residuos sin diligenciar.
test('el 422 del wizard de Residuos devuelve el mensaje del campo obligatorio en español', function () {
    $organization = Organization::factory()->create();
    $actor = localizationActor('wastes.create', $organization->id);

    $response = $this->actingAs($actor)
        ->postJson('/api/admin/wastes', [])
        ->assertStatus(422);

    $nameError = $response->json('errors.name.0');

    expect($nameError)->toBe('El campo nombre es obligatorio.')
        ->and($nameError)->not->toContain('The name field is required');
});

test('las reglas más usadas del proyecto (exists, max, integer, email) también están en español', function () {
    expect(__('validation.exists', ['attribute' => 'organización']))
        ->toBe('El valor seleccionado en organización no es válido.')
        ->and(__('validation.max.string', ['attribute' => 'nombre', 'max' => 255]))
        ->toBe('El campo nombre no debe tener más de 255 caracteres.')
        ->and(__('validation.integer', ['attribute' => 'cantidad']))
        ->toBe('El campo cantidad debe ser un número entero.')
        ->and(__('validation.email', ['attribute' => 'correo electrónico']))
        ->toBe('El campo correo electrónico debe ser una dirección de correo válida.');
});

test('no queda ninguna clave de validación sin traducir', function () {
    $spanish = require lang_path('es/validation.php');
    $english = require base_path('vendor/laravel/framework/src/Illuminate/Translation/lang/en/validation.php');

    $missing = array_diff(array_keys($english), array_keys($spanish));

    expect($missing)->toBeEmpty(
        'Faltan traducir estas reglas de validación: '.implode(', ', $missing),
    );
});
