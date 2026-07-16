<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\VehicleFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

// esquema-bd: vehicles (RN-VEH-001 a RN-VEH-008, CU-051.1/.2/.3/.4). Acceso
// dual (platform staff gestiona TODOS los vehículos, un admin de tenant o
// un usuario con rol LOGÍSTICA solo los de su organización) -- mismo patrón
// exacto que `Branch::isAccessibleBy()`. Sin restricción de business_role
// para poseer vehículos: desviación deliberada de RN-090 tal como está
// escrita hoy, confirmada por el usuario -- cualquier organización puede
// tener vehículos.
//
// `created_by`/`updated_by` en el Fillable a propósito -- mismo criterio
// que `Branch`/`Organization`: siempre se fijan server-side desde
// `$request->user()->id` en VehicleController, nunca como input del
// cliente.
#[Fillable([
    'organization_id', 'branch_id', 'code', 'plate_number', 'vin',
    'vehicle_type_id', 'brand', 'model', 'manufacturing_year',
    'max_load_capacity', 'capacity_unit', 'supports_hazmat', 'has_gps',
    'operational_status', 'soat_expiration_date',
    'technical_inspection_expiration', 'is_active', 'created_by', 'updated_by',
])]
class Vehicle extends Model
{
    /** @use HasFactory<VehicleFactory> */
    use HasFactory, HasUuid, SoftDeletes;

    protected function casts(): array
    {
        return [
            'max_load_capacity' => 'decimal:2',
            'supports_hazmat' => 'boolean',
            'has_gps' => 'boolean',
            'soat_expiration_date' => 'date',
            'technical_inspection_expiration' => 'date',
            'is_active' => 'boolean',
            'metadata' => 'array',
        ];
    }

    /**
     * RN-VEH: la placa se normaliza a mayúsculas antes de guardar (visto en
     * el wireframe del CU-051.1) -- mutator en el modelo, no en el
     * controller, para que la normalización aplique sin importar el punto
     * de entrada (store/update/seeders/tinker).
     */
    protected function plateNumber(): Attribute
    {
        return Attribute::make(
            set: fn (?string $value) => $value !== null ? mb_strtoupper(trim($value)) : $value,
        );
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function vehicleType(): BelongsTo
    {
        return $this->belongsTo(VehicleType::class);
    }

    /**
     * esquema-bd: vehicles.created_by/updated_by (auditoría estándar) --
     * mismo patrón que Branch::createdBy()/updatedBy().
     */
    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    /**
     * Eje de aislamiento tenant-vs-platform-staff -- mismo criterio y misma
     * firma que `Branch::isAccessibleBy()`.
     */
    public function isAccessibleBy(User $actor): bool
    {
        return $actor->isPlatformStaff() || $this->organization_id === $actor->tenant_organization_id;
    }
}
