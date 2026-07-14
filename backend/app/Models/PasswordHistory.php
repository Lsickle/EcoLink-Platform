<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

// esquema-bd, módulo Usuarios y Seguridad (D-U06): password_histories,
// tabla nueva -- respalda RN-039 (no reutilizar contraseñas recientes).
class PasswordHistory extends Model
{
    public $timestamps = false;

    protected $fillable = ['user_id', 'password_hash'];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $history) {
            $history->created_at ??= now();
        });
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
