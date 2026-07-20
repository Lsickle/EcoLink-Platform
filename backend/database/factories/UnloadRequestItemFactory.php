<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\UnloadRequest;
use App\Models\UnloadRequestItem;
use App\Models\Waste;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<UnloadRequestItem>
 */
class UnloadRequestItemFactory extends Factory
{
    protected $model = UnloadRequestItem::class;

    public function definition(): array
    {
        return [
            'tenant_organization_id' => Organization::factory(),
            'unload_request_id' => UnloadRequest::factory(),
            'manifest_load_item_id' => null,
            'waste_id' => Waste::factory(),
            'requested_quantity' => 100,
            'unit_of_measure' => 'KG',
            'packaging_type' => null,
            'line_number' => 1,
            'is_active' => true,
        ];
    }
}
