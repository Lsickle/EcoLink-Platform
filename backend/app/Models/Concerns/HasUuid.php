<?php

namespace App\Models\Concerns;

use Illuminate\Support\Str;

/**
 * Todas las tablas de esquema-bd definen `uuid UUID NOT NULL UNIQUE DEFAULT
 * gen_random_uuid()`. Ese default vive en Postgres, así que un modelo recién
 * creado con Eloquent no lo ve en memoria hasta un refresh() explícito (el
 * INSERT no relee columnas con DEFAULT salvo la PK autoincremental). Se
 * genera el UUID en PHP antes de insertar para que estén disponibles de
 * inmediato; el DEFAULT de Postgres queda como red de seguridad para
 * inserts que no pasen por Eloquent.
 */
trait HasUuid
{
    protected static function bootHasUuid(): void
    {
        static::creating(function ($model) {
            $model->uuid ??= (string) Str::uuid();
        });
    }
}
