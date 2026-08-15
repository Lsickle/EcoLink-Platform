<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\SubgestorGestorRelationshipFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

// Vínculo comercial Subgestor -> Gestor (Fase 2 del ciclo de vida del residuo,
// 2026-08-15). Ver docblock de la migración
// create_subgestor_gestor_relationships_table -- mismo patrón que
// `GeneratorGestorRelationship`, pero SIN Generador en ninguno de sus lados:
// es la primera relación comercial del sistema entre dos organizaciones
// prestadoras.
//
// Acota a qué Gestores puede delegarle una asignación de tratamiento cada
// Subgestor.
//
// `authorized_by`/`authorized_at`/`revoked_by`/`revoked_at`/`is_active` se
// retiran deliberadamente del $fillable -- mismo criterio que las otras dos
// relaciones comerciales: solo deben cambiar vía la lógica dedicada del
// controller, nunca vía mass-assignment directo.
#[Fillable([
    'subgestor_organization_id', 'gestor_organization_id', 'observations',
    'metadata', 'created_by', 'updated_by',
])]
class SubgestorGestorRelationship extends Model
{
    /** @use HasFactory<SubgestorGestorRelationshipFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'authorized_at' => 'datetime',
            'revoked_at' => 'datetime',
            'is_active' => 'boolean',
            'metadata' => 'array',
        ];
    }

    public function subgestorOrganization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'subgestor_organization_id');
    }

    public function gestorOrganization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'gestor_organization_id');
    }

    public function authorizedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'authorized_by');
    }

    public function revokedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'revoked_by');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    /**
     * Acceso DUAL, mismo criterio que las otras dos relaciones comerciales.
     * En la práctica un Gestor DE REFERENCIA no tiene usuarios que puedan
     * consultarla -- se deja igual de todas formas para no inventar una regla
     * distinta si ese Gestor llegara a operar dentro de la plataforma.
     */
    public function isAccessibleBy(User $actor): bool
    {
        return $actor->isPlatformStaff()
            || $this->subgestor_organization_id === $actor->tenant_organization_id
            || $this->gestor_organization_id === $actor->tenant_organization_id;
    }
}
