<?php

use App\Models\Organization;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserRole;
use App\Models\WasteStream;
use Illuminate\Http\UploadedFile;

// Primer módulo real del dominio Residuos: catálogo "Corrientes de Residuos"
// (Y/A) -- gateado por WasteStreamPolicy -> User::hasPermission()
// ('waste_streams.read'/'waste_streams.manage').

function actorWithWasteStreamPermission(array $codes, ?int $tenantId = null): User
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

test('index respeta waste_streams.read', function () {
    WasteStream::factory()->create();

    $noPermission = User::factory()->create();
    $this->actingAs($noPermission)->getJson('/api/admin/waste-streams')->assertForbidden();

    $reader = actorWithWasteStreamPermission(['waste_streams.read']);
    $this->actingAs($reader)->getJson('/api/admin/waste-streams')->assertOk();
});

test('index filtra por search en code/name', function () {
    WasteStream::factory()->create(['code' => 'Y8', 'name' => 'Desechos de residuos de sustancias explosivas']);
    WasteStream::factory()->create(['code' => 'Y99', 'name' => 'Otra corriente sin relacion']);
    $actor = actorWithWasteStreamPermission(['waste_streams.read']);

    $response = $this->actingAs($actor)->getJson('/api/admin/waste-streams?search=explosivas')->assertOk();

    $codes = collect($response->json('data'))->pluck('code');
    expect($codes)->toContain('Y8')->not->toContain('Y99');
});

test('index filtra por tipo (Y/A, exclusivo de WasteStream)', function () {
    WasteStream::factory()->create(['code' => 'Y1', 'tipo' => 'Y']);
    WasteStream::factory()->create(['code' => 'A1010', 'tipo' => 'A']);
    $actor = actorWithWasteStreamPermission(['waste_streams.read']);

    $onlyY = collect($this->actingAs($actor)->getJson('/api/admin/waste-streams?tipo=Y')->assertOk()->json('data'))->pluck('code');
    expect($onlyY)->toContain('Y1')->not->toContain('A1010');

    $onlyA = collect($this->actingAs($actor)->getJson('/api/admin/waste-streams?tipo=A')->assertOk()->json('data'))->pluck('code');
    expect($onlyA)->toContain('A1010')->not->toContain('Y1');
});

test('index filtra por status active/inactive', function () {
    WasteStream::factory()->create(['code' => 'Y2', 'is_active' => true]);
    WasteStream::factory()->create(['code' => 'Y3', 'is_active' => false]);
    $actor = actorWithWasteStreamPermission(['waste_streams.read']);

    $active = collect($this->actingAs($actor)->getJson('/api/admin/waste-streams?status=active')->assertOk()->json('data'))->pluck('code');
    expect($active)->toContain('Y2')->not->toContain('Y3');
});

test('index ordena por sort/direction (code default asc)', function () {
    WasteStream::factory()->create(['code' => 'Y9']);
    WasteStream::factory()->create(['code' => 'Y1']);
    $actor = actorWithWasteStreamPermission(['waste_streams.read']);

    $codesAsc = collect($this->actingAs($actor)->getJson('/api/admin/waste-streams?sort=code&direction=asc')->assertOk()->json('data'))->pluck('code')->values();
    expect($codesAsc->first())->toBe('Y1');

    $codesDesc = collect($this->actingAs($actor)->getJson('/api/admin/waste-streams?sort=code&direction=desc')->assertOk()->json('data'))->pluck('code')->values();
    expect($codesDesc->first())->toBe('Y9');
});

test('index ignora columna de sort fuera de la whitelist', function () {
    WasteStream::factory()->create();
    $actor = actorWithWasteStreamPermission(['waste_streams.read']);

    $this->actingAs($actor)->getJson('/api/admin/waste-streams?sort=1)); DROP TABLE waste_streams; --')->assertOk();
});

test('index aisla cross-tenant: una corriente de OTRO tenant no aparece para un actor sin isPlatformStaff()', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $ownStream = WasteStream::factory()->create(['tenant_organization_id' => $orgA->id, 'code' => 'Y_OWN_A']);
    $otherTenantStream = WasteStream::factory()->create(['tenant_organization_id' => $orgB->id, 'code' => 'Y_OTHER_B']);
    $globalStream = WasteStream::factory()->create(['tenant_organization_id' => null, 'code' => 'Y_GLOBAL']);

    $actor = actorWithWasteStreamPermission(['waste_streams.read'], $orgA->id);

    $response = $this->actingAs($actor)->getJson('/api/admin/waste-streams')->assertOk();

    $codes = collect($response->json('data'))->pluck('code');
    expect($codes)->toContain($ownStream->code)
        ->and($codes)->toContain($globalStream->code)
        ->and($codes)->not->toContain($otherTenantStream->code);
});

// ---- store() ----

test('store crea una corriente nueva (waste_streams.manage)', function () {
    $actor = actorWithWasteStreamPermission(['waste_streams.manage']);

    $response = $this->actingAs($actor)->postJson('/api/admin/waste-streams', [
        'code' => 'Y_NEW_1',
        'name' => 'Corriente de prueba',
        'tipo' => 'Y',
    ]);

    $response->assertCreated()->assertJsonPath('waste_stream.code', 'Y_NEW_1');

    $wasteStream = WasteStream::query()->where('code', 'Y_NEW_1')->firstOrFail();
    expect($wasteStream->is_system)->toBeFalse();
});

test('store sin waste_streams.manage devuelve 403', function () {
    $actor = User::factory()->create();

    $this->actingAs($actor)->postJson('/api/admin/waste-streams', ['code' => 'X', 'name' => 'X', 'tipo' => 'Y'])->assertForbidden();
});

test('store rechaza code duplicado', function () {
    WasteStream::factory()->create(['code' => 'Y_DUP']);
    $actor = actorWithWasteStreamPermission(['waste_streams.manage']);

    $this->actingAs($actor)->postJson('/api/admin/waste-streams', [
        'code' => 'Y_DUP',
        'name' => 'Duplicada',
        'tipo' => 'Y',
    ])->assertUnprocessable()->assertJsonValidationErrors('code');
});

test('store fija tenant_organization_id del actor, nunca del input del cliente', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();
    $actor = actorWithWasteStreamPermission(['waste_streams.manage'], $orgA->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/waste-streams', [
        'code' => 'Y_TENANT_TEST',
        'name' => 'Tenant test',
        'tipo' => 'Y',
        'tenant_organization_id' => $orgB->id,
    ])->assertCreated();

    $wasteStream = WasteStream::query()->where('code', 'Y_TENANT_TEST')->firstOrFail();
    expect($wasteStream->tenant_organization_id)->toBe($orgA->id);
});

// ---- update() ----

test('update edita una corriente (waste_streams.manage)', function () {
    $wasteStream = WasteStream::factory()->create(['is_system' => false]);
    $actor = actorWithWasteStreamPermission(['waste_streams.manage']);

    $this->actingAs($actor)->putJson("/api/admin/waste-streams/{$wasteStream->id}", ['name' => 'Nombre editado'])
        ->assertOk()
        ->assertJsonPath('waste_stream.name', 'Nombre editado');
});

test('update rechaza cambiar tipo de cualquier corriente (de sistema o no)', function () {
    $wasteStream = WasteStream::factory()->create(['tipo' => 'Y', 'is_system' => false]);
    $actor = actorWithWasteStreamPermission(['waste_streams.manage']);

    $this->actingAs($actor)->putJson("/api/admin/waste-streams/{$wasteStream->id}", ['tipo' => 'A'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('tipo');

    expect($wasteStream->fresh()->tipo)->toBe('Y');
});

test('update rechaza cambiar code de una corriente de sistema (is_system=true)', function () {
    $systemStream = WasteStream::factory()->create(['code' => 'Y_SYS', 'is_system' => true]);
    $actor = actorWithWasteStreamPermission(['waste_streams.manage']);

    $this->actingAs($actor)->putJson("/api/admin/waste-streams/{$systemStream->id}", ['code' => 'Y_HACKED'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('code');

    expect($systemStream->fresh()->code)->toBe('Y_SYS');
});

test('update SÍ permite cambiar code de una corriente NO de sistema', function () {
    $customStream = WasteStream::factory()->create(['code' => 'Y_CUSTOM', 'is_system' => false]);
    $actor = actorWithWasteStreamPermission(['waste_streams.manage']);

    $this->actingAs($actor)->putJson("/api/admin/waste-streams/{$customStream->id}", ['code' => 'Y_CUSTOM_RENAMED'])
        ->assertOk()
        ->assertJsonPath('waste_stream.code', 'Y_CUSTOM_RENAMED');
});

test('update sin waste_streams.manage devuelve 403', function () {
    $wasteStream = WasteStream::factory()->create();
    $actor = User::factory()->create();

    $this->actingAs($actor)->putJson("/api/admin/waste-streams/{$wasteStream->id}", ['name' => 'X'])->assertForbidden();
});

// ---- activate()/deactivate() ----

test('activate/deactivate respetan waste_streams.manage y cambian is_active', function () {
    $wasteStream = WasteStream::factory()->create(['is_active' => true]);
    $actor = actorWithWasteStreamPermission(['waste_streams.manage']);

    $this->actingAs($actor)->postJson("/api/admin/waste-streams/{$wasteStream->id}/deactivate")
        ->assertOk()
        ->assertJsonPath('waste_stream.is_active', false);
    expect($wasteStream->fresh()->is_active)->toBeFalse();

    $this->actingAs($actor)->postJson("/api/admin/waste-streams/{$wasteStream->id}/activate")
        ->assertOk()
        ->assertJsonPath('waste_stream.is_active', true);
    expect($wasteStream->fresh()->is_active)->toBeTrue();
});

test('activate/deactivate sin waste_streams.manage devuelven 403', function () {
    $wasteStream = WasteStream::factory()->create();
    $actor = User::factory()->create();

    $this->actingAs($actor)->postJson("/api/admin/waste-streams/{$wasteStream->id}/activate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/waste-streams/{$wasteStream->id}/deactivate")->assertForbidden();
});

// ---- import() ----

test('import procesa CSV: fila nueva -> created, fila existente -> updated, fila sin code -> error sin abortar el resto', function () {
    WasteStream::factory()->create(['code' => 'Y_EXISTING', 'name' => 'Nombre viejo', 'tipo' => 'Y']);

    $csv = "code,name,tipo\n"
        ."Y_IMPORT_NEW,Corriente importada nueva,Y\n"
        ."Y_EXISTING,Nombre actualizado,Y\n"
        .",Fila sin code,Y\n";

    $file = UploadedFile::fake()->createWithContent('corrientes.csv', $csv);
    $actor = actorWithWasteStreamPermission(['waste_streams.manage']);

    $response = $this->actingAs($actor)->postJson('/api/admin/waste-streams/import', ['file' => $file])->assertOk();

    $response->assertJsonPath('created', 1)->assertJsonPath('updated', 1);
    expect($response->json('errors'))->toHaveCount(1)
        ->and($response->json('errors.0.row'))->toBe(4);

    expect(WasteStream::query()->where('code', 'Y_IMPORT_NEW')->exists())->toBeTrue();
    expect(WasteStream::query()->where('code', 'Y_EXISTING')->first()->name)->toBe('Nombre actualizado');
});

test('import sin waste_streams.manage devuelve 403', function () {
    $actor = User::factory()->create();
    $file = UploadedFile::fake()->createWithContent('corrientes.csv', "code,name,tipo\nY_X,Nombre,Y\n");

    $this->actingAs($actor)->postJson('/api/admin/waste-streams/import', ['file' => $file])->assertForbidden();
});

// ---- Hallazgo Crítico (especialista-seguridad, 2026-07-15): import NO debe
// sobrescribir por code una corriente de OTRO tenant, ni saltarse la
// inmutabilidad de `tipo` -- fijado en el mismo lote que se encontró. ----

test('import NO sobrescribe (reporta error) una corriente cuyo code pertenece EXPLÍCITAMENTE a OTRO tenant', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $otherTenantStream = WasteStream::factory()->create([
        'tenant_organization_id' => $orgB->id,
        'code' => 'Y_SECUESTRO',
        'name' => 'Nombre original de OrgB',
        'tipo' => 'Y',
    ]);

    $csv = "code,name,tipo\nY_SECUESTRO,Nombre robado por OrgA,Y\n";
    $file = UploadedFile::fake()->createWithContent('corrientes.csv', $csv);
    $actor = actorWithWasteStreamPermission(['waste_streams.manage'], $orgA->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/waste-streams/import', ['file' => $file])->assertOk();

    $response->assertJsonPath('created', 0)->assertJsonPath('updated', 0);
    expect($response->json('errors'))->toHaveCount(1);

    // El registro de OrgB no cambió NI de nombre NI de tenant_organization_id.
    $otherTenantStream->refresh();
    expect($otherTenantStream->name)->toBe('Nombre original de OrgB')
        ->and($otherTenantStream->tenant_organization_id)->toBe($orgB->id);
});

test('import NO permite cambiar el tipo (Y/A) de una corriente existente vía CSV', function () {
    WasteStream::factory()->create(['code' => 'Y_TIPO_FIJO', 'name' => 'Corriente Y', 'tipo' => 'Y']);

    $csv = "code,name,tipo\nY_TIPO_FIJO,Nombre nuevo,A\n";
    $file = UploadedFile::fake()->createWithContent('corrientes.csv', $csv);
    $actor = actorWithWasteStreamPermission(['waste_streams.manage']);

    $response = $this->actingAs($actor)->postJson('/api/admin/waste-streams/import', ['file' => $file])->assertOk();

    $response->assertJsonPath('created', 0)->assertJsonPath('updated', 0);
    expect($response->json('errors'))->toHaveCount(1);
    expect(WasteStream::query()->where('code', 'Y_TIPO_FIJO')->first()->tipo)->toBe('Y');
});

// ---- Gate: aislamiento cross-tenant en view/update ----

test('view/update DENIEGAN (403) sobre una corriente de OTRO tenant', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();

    $otherTenantStream = WasteStream::factory()->create(['tenant_organization_id' => $orgB->id]);

    $reader = actorWithWasteStreamPermission(['waste_streams.read'], $orgA->id);
    $this->actingAs($reader)->getJson("/api/admin/waste-streams/{$otherTenantStream->id}")->assertForbidden();

    $editor = actorWithWasteStreamPermission(['waste_streams.manage'], $orgA->id);
    $this->actingAs($editor)->putJson("/api/admin/waste-streams/{$otherTenantStream->id}", ['name' => 'Hackeado'])->assertForbidden();
});
