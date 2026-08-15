<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\BusinessRole;
use Illuminate\Http\Request;

/**
 * Catálogo de solo lectura de `business_roles` ("Tipo de Organización" en
 * Figma) -- gap encontrado durante la implementación del CRUD de
 * Organizaciones: el modelo/seeder ya existían (5 filas reales:
 * GENERATOR/GESTOR/SUBGESTOR/TRANSPORTER/COMERCIALIZADOR), pero nunca se
 * expuso ningún endpoint. El frontend de Organizaciones necesita los ids
 * reales (no asumidos) para el multi-select de creación y los checkboxes
 * de asignación -- mismo gate que `OrganizationController`
 * (`isPlatformStaff()`), sin Policy de modelo, porque hoy es el único
 * consumidor de este catálogo.
 */
class BusinessRoleController extends Controller
{
    public function index(Request $request)
    {
        abort_unless($request->user()->isPlatformStaff(), 403, 'Solo el staff de la plataforma puede consultar este catálogo.');

        $businessRoles = BusinessRole::query()
            ->when($request->boolean('active_only'), fn ($query) => $query->where('is_active', true))
            ->orderBy('sort_order')
            // `can_treat_waste` (Fase 2, 2026-08-15): la UI necesita saber cual
            // de los tipos asignados es el que trata residuos, para aplicarle la
            // marca operativo/referencia sin asumir un codigo concreto.
            ->get(['id', 'code', 'name', 'description', 'sort_order', 'is_active', 'can_treat_waste']);

        return response()->json(['data' => $businessRoles]);
    }
}
