<?php

use App\Models\BusinessRole;
use Database\Seeders\BusinessRoleSeeder;

// Eje 2 de autorización -- catálogo de 5 business_roles (tipo de
// organización). Cada assertion verifica los 8 flags COMPLETOS (los
// listados en true y, por omisión, todos los demás en false) para no dejar
// pasar un flag de más ni de menos.

// Función global (no closure) a propósito: los closures de test() de Pest
// no heredan variables del scope del archivo salvo `use()` explícito -- una
// función top-level sí es accesible desde cualquier closure interno.
function assertBusinessRoleFlags(BusinessRole $businessRole, array $expectedTrueFlags): void
{
    $allCapabilityFlags = [
        'can_generate_waste', 'can_transport_waste', 'can_treat_waste',
        'can_approve_treatments', 'can_issue_manifests',
        'can_issue_disposal_certificates', 'requires_environmental_license',
        'requires_transport_authorization',
    ];

    foreach ($allCapabilityFlags as $flag) {
        $expected = in_array($flag, $expectedTrueFlags, true);
        expect($businessRole->{$flag})->toBe($expected, "Flag '{$flag}' de '{$businessRole->code}' esperado {$expected}, obtenido {$businessRole->{$flag}}");
    }
}

beforeEach(function () {
    $this->seed(BusinessRoleSeeder::class);
});

test('siembra exactamente 5 business_roles', function () {
    expect(BusinessRole::query()->count())->toBe(5);
});

test('GENERATOR tiene exactamente can_generate_waste=true y el resto en false', function () {
    $businessRole = BusinessRole::query()->where('code', 'GENERATOR')->firstOrFail();

    assertBusinessRoleFlags($businessRole, ['can_generate_waste']);
});

test('GESTOR tiene exactamente los 6 flags de gestión integral y ambos requires en true', function () {
    $businessRole = BusinessRole::query()->where('code', 'GESTOR')->firstOrFail();

    assertBusinessRoleFlags($businessRole, [
        'can_transport_waste', 'can_treat_waste', 'can_approve_treatments',
        'can_issue_manifests', 'can_issue_disposal_certificates',
        'requires_environmental_license', 'requires_transport_authorization',
    ]);
});

test('SUBGESTOR tiene exactamente can_transport_waste y requires_transport_authorization en true', function () {
    $businessRole = BusinessRole::query()->where('code', 'SUBGESTOR')->firstOrFail();

    assertBusinessRoleFlags($businessRole, ['can_transport_waste', 'requires_transport_authorization']);
});

test('TRANSPORTER tiene exactamente can_transport_waste y requires_transport_authorization en true', function () {
    $businessRole = BusinessRole::query()->where('code', 'TRANSPORTER')->firstOrFail();

    assertBusinessRoleFlags($businessRole, ['can_transport_waste', 'requires_transport_authorization']);
});

test('COMERCIALIZADOR tiene los 8 flags en false', function () {
    $businessRole = BusinessRole::query()->where('code', 'COMERCIALIZADOR')->firstOrFail();

    assertBusinessRoleFlags($businessRole, []);
});

test('el seeder es idempotente (correr dos veces no duplica filas)', function () {
    $this->seed(BusinessRoleSeeder::class);

    expect(BusinessRole::query()->count())->toBe(5);
});
