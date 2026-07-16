<?php

use App\Models\Organization;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\UnCode;
use App\Models\User;
use App\Models\UserRole;
use Illuminate\Http\UploadedFile;

// Catálogo de Códigos ONU de transporte de mercancías peligrosas --
// gateado por UnCodePolicy -> User::hasPermission()
// ('un_codes.read'/'un_codes.manage'). Independiente de waste_streams
// (sin FK/relación 1:1 en este lote).

function actorWithUnCodePermission(array $codes, ?int $tenantId = null): User
{
    $actor = User::factory()->create(['tenant_organization_id' => $tenantId]);
    $grantRole = Role::factory()->create();

    foreach ($codes as $code) {
        $permission = Permission::query()->firstOrCreate(['code' => $code], [
            'name' => $code, 'module' => explode('.', $code)[0], 'action' => explode('.', $code)[1] ?? $code,
            'scope' => 'tenant', 'is_system' => true, 'is_active' => true,
        ]);
        RolePermission::query()->create(['role_id' => $grantRole->id, 'permission_id' => $permission->id, 'is_active' => true]);
    }

    UserRole::query()->create(['user_id' => $actor->id, 'role_id' => $grantRole->id, 'is_active' => true]);

    return $actor;
}

// ---- index() ----

test('index respeta un_codes.read', function () {
    UnCode::factory()->create();

    $noPermission = User::factory()->create();
    $this->actingAs($noPermission)->getJson('/api/admin/un-codes')->assertForbidden();

    $reader = actorWithUnCodePermission(['un_codes.read']);
    $this->actingAs($reader)->getJson('/api/admin/un-codes')->assertOk();
});

test('index filtra por search en code/name', function () {
    UnCode::factory()->create(['code' => 'UN1013', 'name' => 'Dioxido de carbono comprimido']);
    UnCode::factory()->create(['code' => 'UN1090', 'name' => 'Acetona sin relacion']);
    $actor = actorWithUnCodePermission(['un_codes.read']);

    $response = $this->actingAs($actor)->getJson('/api/admin/un-codes?search=carbono')->assertOk();

    $codes = collect($response->json('data'))->pluck('code');
    expect($codes)->toContain('UN1013')->not->toContain('UN1090');
});

test('index filtra por status active/inactive', function () {
    UnCode::factory()->create(['code' => 'UN0001', 'is_active' => true]);
    UnCode::factory()->create(['code' => 'UN0002', 'is_active' => false]);
    $actor = actorWithUnCodePermission(['un_codes.read']);

    $active = collect($this->actingAs($actor)->getJson('/api/admin/un-codes?status=active')->assertOk()->json('data'))->pluck('code');
    expect($active)->toContain('UN0001')->not->toContain('UN0002');
});

test('index ordena por sort/direction (code default asc)', function () {
    UnCode::factory()->create(['code' => 'UN9000']);
    UnCode::factory()->create(['code' => 'UN1000']);
    $actor = actorWithUnCodePermission(['un_codes.read']);

    $codesAsc = collect($this->actingAs($actor)->getJson('/api/admin/un-codes?sort=code&direction=asc')->assertOk()->json('data'))->pluck('code')->values();
    expect($codesAsc->first())->toBe('UN1000');
});

test('index ignora columna de sort fuera de la whitelist', function () {
    UnCode::factory()->create();
    $actor = actorWithUnCodePermission(['un_codes.read']);

    $this->actingAs($actor)->getJson('/api/admin/un-codes?sort=1)); DROP TABLE un_codes; --')->assertOk();
});

test('index aisla cross-tenant: un código de OTRO tenant no aparece para un actor sin isPlatformStaff()', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $ownCode = UnCode::factory()->create(['tenant_organization_id' => $orgA->id, 'code' => 'UN_OWN_A']);
    $otherTenantCode = UnCode::factory()->create(['tenant_organization_id' => $orgB->id, 'code' => 'UN_OTHER_B']);
    $globalCode = UnCode::factory()->create(['tenant_organization_id' => null, 'code' => 'UN_GLOBAL']);

    $actor = actorWithUnCodePermission(['un_codes.read'], $orgA->id);

    $response = $this->actingAs($actor)->getJson('/api/admin/un-codes')->assertOk();

    $codes = collect($response->json('data'))->pluck('code');
    expect($codes)->toContain($ownCode->code)
        ->and($codes)->toContain($globalCode->code)
        ->and($codes)->not->toContain($otherTenantCode->code);
});

// ---- store() ----

test('store crea un código UN nuevo (un_codes.manage)', function () {
    $actor = actorWithUnCodePermission(['un_codes.manage']);

    $response = $this->actingAs($actor)->postJson('/api/admin/un-codes', [
        'code' => 'UN_NEW_1',
        'name' => 'Código de prueba',
    ]);

    $response->assertCreated()->assertJsonPath('un_code.code', 'UN_NEW_1');

    $unCode = UnCode::query()->where('code', 'UN_NEW_1')->firstOrFail();
    expect($unCode->is_system)->toBeFalse();
});

test('store sin un_codes.manage devuelve 403', function () {
    $actor = User::factory()->create();

    $this->actingAs($actor)->postJson('/api/admin/un-codes', ['code' => 'X', 'name' => 'X'])->assertForbidden();
});

test('store rechaza code duplicado', function () {
    UnCode::factory()->create(['code' => 'UN_DUP']);
    $actor = actorWithUnCodePermission(['un_codes.manage']);

    $this->actingAs($actor)->postJson('/api/admin/un-codes', [
        'code' => 'UN_DUP',
        'name' => 'Duplicado',
    ])->assertUnprocessable()->assertJsonValidationErrors('code');
});

test('store fija tenant_organization_id del actor, nunca del input del cliente', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();
    $actor = actorWithUnCodePermission(['un_codes.manage'], $orgA->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/un-codes', [
        'code' => 'UN_TENANT_TEST',
        'name' => 'Tenant test',
        'tenant_organization_id' => $orgB->id,
    ])->assertCreated();

    $unCode = UnCode::query()->where('code', 'UN_TENANT_TEST')->firstOrFail();
    expect($unCode->tenant_organization_id)->toBe($orgA->id);
});

// ---- update() ----

test('update edita un código UN (un_codes.manage)', function () {
    $unCode = UnCode::factory()->create(['is_system' => false]);
    $actor = actorWithUnCodePermission(['un_codes.manage']);

    $this->actingAs($actor)->putJson("/api/admin/un-codes/{$unCode->id}", ['name' => 'Nombre editado'])
        ->assertOk()
        ->assertJsonPath('un_code.name', 'Nombre editado');
});

test('update rechaza cambiar code de un código de sistema (is_system=true)', function () {
    $systemCode = UnCode::factory()->create(['code' => 'UN_SYS', 'is_system' => true]);
    $actor = actorWithUnCodePermission(['un_codes.manage']);

    $this->actingAs($actor)->putJson("/api/admin/un-codes/{$systemCode->id}", ['code' => 'UN_HACKED'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('code');

    expect($systemCode->fresh()->code)->toBe('UN_SYS');
});

test('update SÍ permite cambiar code de un código NO de sistema', function () {
    $customCode = UnCode::factory()->create(['code' => 'UN_CUSTOM', 'is_system' => false]);
    $actor = actorWithUnCodePermission(['un_codes.manage']);

    $this->actingAs($actor)->putJson("/api/admin/un-codes/{$customCode->id}", ['code' => 'UN_CUSTOM_RENAMED'])
        ->assertOk()
        ->assertJsonPath('un_code.code', 'UN_CUSTOM_RENAMED');
});

test('update sin un_codes.manage devuelve 403', function () {
    $unCode = UnCode::factory()->create();
    $actor = User::factory()->create();

    $this->actingAs($actor)->putJson("/api/admin/un-codes/{$unCode->id}", ['name' => 'X'])->assertForbidden();
});

// ---- activate()/deactivate() ----

test('activate/deactivate respetan un_codes.manage y cambian is_active', function () {
    $unCode = UnCode::factory()->create(['is_active' => true]);
    $actor = actorWithUnCodePermission(['un_codes.manage']);

    $this->actingAs($actor)->postJson("/api/admin/un-codes/{$unCode->id}/deactivate")
        ->assertOk()
        ->assertJsonPath('un_code.is_active', false);
    expect($unCode->fresh()->is_active)->toBeFalse();

    $this->actingAs($actor)->postJson("/api/admin/un-codes/{$unCode->id}/activate")
        ->assertOk()
        ->assertJsonPath('un_code.is_active', true);
    expect($unCode->fresh()->is_active)->toBeTrue();
});

test('activate/deactivate sin un_codes.manage devuelven 403', function () {
    $unCode = UnCode::factory()->create();
    $actor = User::factory()->create();

    $this->actingAs($actor)->postJson("/api/admin/un-codes/{$unCode->id}/activate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/un-codes/{$unCode->id}/deactivate")->assertForbidden();
});

// ---- import() ----

test('import procesa CSV: fila nueva -> created, fila existente -> updated, fila sin code -> error sin abortar el resto', function () {
    UnCode::factory()->create(['code' => 'UN_EXISTING', 'name' => 'Nombre viejo']);

    $csv = "code,name\n"
        ."UN_IMPORT_NEW,Codigo importado nuevo\n"
        ."UN_EXISTING,Nombre actualizado\n"
        .",Fila sin code\n";

    $file = UploadedFile::fake()->createWithContent('un_codes.csv', $csv);
    $actor = actorWithUnCodePermission(['un_codes.manage']);

    $response = $this->actingAs($actor)->postJson('/api/admin/un-codes/import', ['file' => $file])->assertOk();

    $response->assertJsonPath('created', 1)->assertJsonPath('updated', 1);
    expect($response->json('errors'))->toHaveCount(1)
        ->and($response->json('errors.0.row'))->toBe(4);

    expect(UnCode::query()->where('code', 'UN_IMPORT_NEW')->exists())->toBeTrue();
    expect(UnCode::query()->where('code', 'UN_EXISTING')->first()->name)->toBe('Nombre actualizado');
});

test('import sin un_codes.manage devuelve 403', function () {
    $actor = User::factory()->create();
    $file = UploadedFile::fake()->createWithContent('un_codes.csv', "code,name\nUN_X,Nombre\n");

    $this->actingAs($actor)->postJson('/api/admin/un-codes/import', ['file' => $file])->assertForbidden();
});

// ---- Hallazgo Crítico (especialista-seguridad, 2026-07-15): import NO debe
// sobrescribir por code un código UN de OTRO tenant -- fijado en el mismo
// lote en que se encontró. ----

test('import NO sobrescribe (reporta error) un código UN cuyo code pertenece EXPLÍCITAMENTE a OTRO tenant', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $otherTenantCode = UnCode::factory()->create([
        'tenant_organization_id' => $orgB->id,
        'code' => 'UN_SECUESTRO',
        'name' => 'Nombre original de OrgB',
    ]);

    $csv = "code,name\nUN_SECUESTRO,Nombre robado por OrgA\n";
    $file = UploadedFile::fake()->createWithContent('un_codes.csv', $csv);
    $actor = actorWithUnCodePermission(['un_codes.manage'], $orgA->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/un-codes/import', ['file' => $file])->assertOk();

    $response->assertJsonPath('created', 0)->assertJsonPath('updated', 0);
    expect($response->json('errors'))->toHaveCount(1);

    $otherTenantCode->refresh();
    expect($otherTenantCode->name)->toBe('Nombre original de OrgB')
        ->and($otherTenantCode->tenant_organization_id)->toBe($orgB->id);
});

// ---- Gate: aislamiento cross-tenant en view/update ----

test('view/update DENIEGAN (403) sobre un código UN de OTRO tenant', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $otherTenantCode = UnCode::factory()->create(['tenant_organization_id' => $orgB->id]);

    $reader = actorWithUnCodePermission(['un_codes.read'], $orgA->id);
    $this->actingAs($reader)->getJson("/api/admin/un-codes/{$otherTenantCode->id}")->assertForbidden();

    $editor = actorWithUnCodePermission(['un_codes.manage'], $orgA->id);
    $this->actingAs($editor)->putJson("/api/admin/un-codes/{$otherTenantCode->id}", ['name' => 'Hackeado'])->assertForbidden();
});
