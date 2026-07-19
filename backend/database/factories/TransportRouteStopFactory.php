<?php

namespace Database\Factories;

use App\Models\TransportRoute;
use App\Models\TransportRouteStop;
use App\Models\TransportSchedule;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<TransportRouteStop>
 */
class TransportRouteStopFactory extends Factory
{
    protected $model = TransportRouteStop::class;

    public function definition(): array
    {
        return [
            'transport_route_id' => TransportRoute::factory(),
            'transport_schedule_id' => TransportSchedule::factory(),
            'stop_sequence' => 1,
            'observations' => null,
        ];
    }
}
