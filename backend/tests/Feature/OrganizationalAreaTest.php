<?php

use App\Models\Organization;
use App\Models\OrganizationalArea;
use Illuminate\Database\QueryException;

// esquema-bd: organizational_areas -- entidad jerárquica scoped por
// organización (gap no documentado en el DDL de esquema-bd, plan aprobado
// del hilo principal). Mismo patrón auto-referencial que
// Organization::parent()/children().

test('árbol de 3 niveles (raíz, hijo, nieto) dentro de una misma organización resuelve parent/children correctamente', function () {
    $organization = Organization::factory()->create();

    $root = OrganizationalArea::factory()->for($organization)->create(['code' => 'ROOT', 'level' => 'Dirección']);
    $child = OrganizationalArea::factory()->childOf($root)->create(['code' => 'CHILD', 'level' => 'Gerencia']);
    $grandchild = OrganizationalArea::factory()->childOf($child)->create(['code' => 'GRANDCHILD', 'level' => 'Coordinación']);

    expect($root->parent)->toBeNull()
        ->and($root->children)->toHaveCount(1)
        ->and($root->children->first()->id)->toBe($child->id)
        ->and($child->parent->id)->toBe($root->id)
        ->and($child->children->first()->id)->toBe($grandchild->id)
        ->and($grandchild->parent->id)->toBe($child->id)
        ->and($grandchild->children)->toHaveCount(0);
});

test('UNIQUE(organization_id, code): mismo code en la misma organización falla', function () {
    $organization = Organization::factory()->create();
    OrganizationalArea::factory()->for($organization)->create(['code' => 'DUP']);

    expect(fn () => OrganizationalArea::factory()->for($organization)->create(['code' => 'DUP']))
        ->toThrow(QueryException::class);
});

test('UNIQUE(organization_id, code): mismo code en OTRA organización sí se permite', function () {
    $organizationA = Organization::factory()->create();
    $organizationB = Organization::factory()->create();

    OrganizationalArea::factory()->for($organizationA)->create(['code' => 'DUP']);
    $areaB = OrganizationalArea::factory()->for($organizationB)->create(['code' => 'DUP']);

    expect($areaB->code)->toBe('DUP');
});

test('borrar la organización borra en cascada sus áreas organizacionales', function () {
    // Organization usa SoftDeletes -- ->delete() es un UPDATE (deleted_at),
    // no dispara el ON DELETE CASCADE de Postgres. forceDelete() sí borra
    // la fila de verdad, que es lo que valida esta prueba.
    $organization = Organization::factory()->create();
    $area = OrganizationalArea::factory()->for($organization)->create();

    $organization->forceDelete();

    expect(OrganizationalArea::withoutGlobalScopes()->find($area->id))->toBeNull();
});

test('borrar un área padre no borra a los hijos -- dejan parent_area_id en null (nullOnDelete)', function () {
    // Mismo motivo que arriba: forceDelete() para disparar el ON DELETE
    // real a nivel de Postgres.
    $organization = Organization::factory()->create();
    $root = OrganizationalArea::factory()->for($organization)->create();
    $child = OrganizationalArea::factory()->childOf($root)->create();

    $root->forceDelete();

    expect(OrganizationalArea::withoutGlobalScopes()->find($child->id))->not->toBeNull()
        ->and($child->fresh()->parent_area_id)->toBeNull();
});
