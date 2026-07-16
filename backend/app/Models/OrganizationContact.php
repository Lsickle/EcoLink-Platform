<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Database\Factories\OrganizationContactFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\Concerns\AsPivot;
use Illuminate\Database\Eloquent\Relations\Pivot;

// esquema-bd: organization_contacts (D-P02 / L-08). Pivote CON IDENTIDAD
// PROPIA -- mismo patrón exacto que OrganizationBusinessRole (Pivot +
// AsPivot + HasUuid, $incrementing=true, SIN SoftDeletes). La revocación es
// solo `is_active=false` (mismo criterio que role_permissions/
// organization_business_roles), nunca un borrado físico ni soft-delete de
// la fila -- ver OrganizationController::revokeContact().
class OrganizationContact extends Pivot
{
    /** @use HasFactory<OrganizationContactFactory> */
    use AsPivot, HasFactory, HasUuid;

    protected $table = 'organization_contacts';

    public $incrementing = true;

    protected function casts(): array
    {
        return [
            'is_primary' => 'boolean',
            'is_active' => 'boolean',
            'start_date' => 'date',
        ];
    }

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Person::class, 'contact_id');
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'organization_id');
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class, 'branch_id');
    }
}
