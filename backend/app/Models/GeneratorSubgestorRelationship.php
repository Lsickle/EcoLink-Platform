<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\GeneratorSubgestorRelationshipFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

// Cadena Generador -> Subgestor -> Gestor en Declaración de Residuos. Ver
// docblock de la migración create_generator_subgestor_relationships_table
// para el detalle completo de las decisiones aplicadas (mismo patrón que
// `GestorCarrierAuthorization`, con roles invertidos: aquí el SUBGESTOR es
// quien autoriza/gestiona -- confirmado explícitamente por el usuario).
//
// `authorized_by`/`authorized_at`/`revoked_by`/`revoked_at`/`is_active` se
// retiran deliberadamente del $fillable -- mismo criterio que
// `GestorCarrierAuthorization`: solo deben cambiar vía la lógica dedicada
// del controller, nunca vía mass-assignment directo.
#[Fillable([
    'generator_organization_id', 'subgestor_organization_id', 'observations',
    'metadata', 'created_by', 'updated_by',
])]
class GeneratorSubgestorRelationship extends Model
{
    /** @use HasFactory<GeneratorSubgestorRelationshipFactory> */
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

    public function generatorOrganization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'generator_organization_id');
    }

    public function subgestorOrganization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'subgestor_organization_id');
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
     * Acceso DUAL (mismo criterio que `GestorCarrierAuthorization`): AMBOS
     * lados -- el Generador cliente Y el Subgestor que lo registró -- pueden
     * VER el registro; quién puede crear/revocar (solo el Subgestor dueño)
     * vive en `GeneratorSubgestorRelationshipPolicy`.
     */
    public function isAccessibleBy(User $actor): bool
    {
        return $actor->isPlatformStaff()
            || $this->generator_organization_id === $actor->tenant_organization_id
            || $this->subgestor_organization_id === $actor->tenant_organization_id;
    }
}
