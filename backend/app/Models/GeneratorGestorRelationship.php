<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\GeneratorGestorRelationshipFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

// Vínculo comercial DIRECTO Generador -> Gestor (Carga Masiva de
// Generadores, confirmado por el usuario 2026-08-11). Ver docblock de la
// migración create_generator_gestor_relationships_table -- mismo patrón que
// `GeneratorSubgestorRelationship`, con roles invertidos: aquí el GESTOR es
// quien autoriza/gestiona.
//
// `authorized_by`/`authorized_at`/`revoked_by`/`revoked_at`/`is_active` se
// retiran deliberadamente del $fillable -- mismo criterio que
// `GeneratorSubgestorRelationship`: solo deben cambiar vía la lógica
// dedicada del controller/servicio, nunca vía mass-assignment directo.
#[Fillable([
    'generator_organization_id', 'gestor_organization_id', 'observations',
    'metadata', 'created_by', 'updated_by',
])]
class GeneratorGestorRelationship extends Model
{
    /** @use HasFactory<GeneratorGestorRelationshipFactory> */
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
     * Acceso DUAL (mismo criterio que `GeneratorSubgestorRelationship`):
     * AMBOS lados -- el Generador cliente Y el Gestor que lo registró --
     * pueden VER el registro; quién puede crear/revocar (solo el Gestor
     * dueño) vive en `GeneratorGestorRelationshipPolicy`.
     */
    public function isAccessibleBy(User $actor): bool
    {
        return $actor->isPlatformStaff()
            || $this->generator_organization_id === $actor->tenant_organization_id
            || $this->gestor_organization_id === $actor->tenant_organization_id;
    }
}
