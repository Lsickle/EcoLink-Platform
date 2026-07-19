<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\TransportRouteStopFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

// Módulo Programación Logística (CU-059/CU-060): ver docblock de la
// migración create_transport_route_stops_table para el detalle completo.
#[Fillable(['transport_route_id', 'transport_schedule_id', 'stop_sequence', 'observations'])]
class TransportRouteStop extends Model
{
    /** @use HasFactory<TransportRouteStopFactory> */
    use HasFactory, HasUuid;

    protected function casts(): array
    {
        return [
            'stop_sequence' => 'integer',
        ];
    }

    public function transportRoute(): BelongsTo
    {
        return $this->belongsTo(TransportRoute::class);
    }

    public function transportSchedule(): BelongsTo
    {
        return $this->belongsTo(TransportSchedule::class);
    }
}
