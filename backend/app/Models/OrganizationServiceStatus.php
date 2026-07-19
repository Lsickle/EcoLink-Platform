<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\OrganizationServiceStatusFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

// esquema-bd (D-S02): organization_service_statuses -- pivote de
// activación, permite a una organización Gestor activar/agregar sus propios
// `service_statuses` personalizados. Sin SoftDeletes -- mismo hallazgo de
// seguridad documentado en OrganizationBusinessRole; el único mecanismo de
// revocación soportado es `is_active`.
#[Fillable(['organization_id', 'service_status_id', 'activated_by', 'activated_at', 'is_active'])]
class OrganizationServiceStatus extends Model
{
    /** @use HasFactory<OrganizationServiceStatusFactory> */
    use HasFactory, HasUuid;

    protected function casts(): array
    {
        return [
            'activated_at' => 'datetime',
            'is_active' => 'boolean',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function serviceStatus(): BelongsTo
    {
        return $this->belongsTo(ServiceStatus::class);
    }

    public function activatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'activated_by');
    }
}
