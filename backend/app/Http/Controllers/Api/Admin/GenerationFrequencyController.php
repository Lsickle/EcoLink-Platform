<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\GenerationFrequency;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * Catálogo Maestro "Frecuencia de Generación" (Módulo Residuos, núcleo).
 * CRUD completo, mismo patrón EXACTO que `PhysicalStateController`. Gateado
 * por `generation_frequencies.read`/`generation_frequencies.manage`.
 */
class GenerationFrequencyController extends Controller
{
    public function index(Request $request)
    {
        Gate::authorize('viewAny', GenerationFrequency::class);

        $search = $request->input('search');
        $status = $request->input('status');

        $sortableColumns = ['code', 'name', 'is_active', 'created_at'];
        $sort = in_array($request->input('sort'), $sortableColumns, true) ? $request->input('sort') : 'code';
        $direction = strtolower((string) $request->input('direction')) === 'desc' ? 'desc' : 'asc';

        $generationFrequencies = GenerationFrequency::query()
            ->when($search, function ($query) use ($search) {
                $query->where(function ($query) use ($search) {
                    $query->where('code', 'ILIKE', "%{$search}%")
                        ->orWhere('name', 'ILIKE', "%{$search}%");
                });
            })
            ->when($status === 'active', fn ($query) => $query->where('is_active', true))
            ->when($status === 'inactive', fn ($query) => $query->where('is_active', false))
            ->orderBy($sort, $direction)
            ->paginate($request->integer('per_page', 15));

        return response()->json($generationFrequencies);
    }

    public function show(GenerationFrequency $generationFrequency)
    {
        Gate::authorize('view', $generationFrequency);

        return response()->json(['generation_frequency' => $generationFrequency]);
    }

    public function store(Request $request)
    {
        Gate::authorize('create', GenerationFrequency::class);

        $data = $request->validate([
            'code' => ['required', 'string', 'max:50', 'unique:generation_frequencies,code'],
            'name' => ['required', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string'],
        ]);

        $generationFrequency = GenerationFrequency::query()->create([
            ...$data,
            'is_system' => false,
            'is_active' => true,
        ]);

        return response()->json(['generation_frequency' => $generationFrequency], 201);
    }

    public function update(Request $request, GenerationFrequency $generationFrequency)
    {
        Gate::authorize('update', $generationFrequency);

        $data = $request->validate([
            'code' => ['sometimes', 'string', 'max:50', Rule::unique('generation_frequencies', 'code')->ignore($generationFrequency->id)],
            'name' => ['sometimes', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string'],
        ]);

        $generationFrequency->fill($data);
        $generationFrequency->save();

        return response()->json(['generation_frequency' => $generationFrequency]);
    }

    public function activate(GenerationFrequency $generationFrequency)
    {
        Gate::authorize('update', $generationFrequency);

        $generationFrequency->forceFill(['is_active' => true])->save();

        return response()->json(['generation_frequency' => $generationFrequency->fresh()]);
    }

    public function deactivate(GenerationFrequency $generationFrequency)
    {
        Gate::authorize('update', $generationFrequency);

        $generationFrequency->forceFill(['is_active' => false])->save();

        return response()->json(['generation_frequency' => $generationFrequency->fresh()]);
    }
}
