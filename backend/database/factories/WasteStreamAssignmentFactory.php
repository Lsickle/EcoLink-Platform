<?php

namespace Database\Factories;

use App\Models\Waste;
use App\Models\WasteStream;
use App\Models\WasteStreamAssignment;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<WasteStreamAssignment>
 */
class WasteStreamAssignmentFactory extends Factory
{
    protected $model = WasteStreamAssignment::class;

    public function definition(): array
    {
        $waste = Waste::factory()->create();

        return [
            'tenant_organization_id' => $waste->tenant_organization_id,
            'organization_id' => $waste->organization_id,
            'waste_id' => $waste->id,
            'waste_stream_id' => WasteStream::factory(),
            'is_primary' => false,
            'classification_source' => 'MANUAL',
            'classified_at' => now(),
            'classified_by' => null,
        ];
    }
}
