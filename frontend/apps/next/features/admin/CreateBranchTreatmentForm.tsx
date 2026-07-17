'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ApiValidationError,
  createBranchTreatment,
  fetchBranches,
  fetchTreatments,
  type AdminBranch,
  type AdminTreatment,
} from 'app/features/admin/api'
import { createBranchTreatmentSchema } from 'app/features/admin/schemas'
import { useAuth, useRequireAuth } from 'app/provider/auth'
import { OrganizationSearchSelect } from './OrganizationSearchSelect'

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-foreground">{children}</h3>
}

type FieldErrors = Partial<Record<'branchId' | 'treatmentId' | 'capacityUnit' | 'validUntil', string>>

// Formulario de creación (POST /api/admin/branch-treatments) -- RN-063/D-R02,
// mismo mecanismo EXACTO que CreateVehicleForm.tsx/CreateBranchForm.tsx. El
// selector de Organización dueña SOLO se muestra si `user.is_platform_staff`
// (para cualquier otro actor el backend fuerza su propia organización
// server-side) -- a DIFERENCIA de esos 2 formularios, aquí SÍ se filtra por
// capacidad de negocio (`capability="can_treat_waste"`, RN-063: solo
// organizaciones Gestor pueden tener `branch_treatments`, el backend lo
// revalida siempre en store()). El selector de Sede se recarga cuando
// cambia la Organización elegida (platform staff) o se carga una sola vez
// con la propia organización del actor (tenant admin, ver
// `fetchBranches()`). El selector de Tratamiento solo ofrece tratamientos
// ACTIVOS del catálogo global.
export function CreateBranchTreatmentForm() {
  const router = useRouter()
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth('branch_treatments.create')
  const isPlatformStaff = Boolean(user?.is_platform_staff)

  const [organizationId, setOrganizationId] = useState<number | null>(null)
  const [organizationLabel, setOrganizationLabel] = useState<string | null>(null)

  const [branches, setBranches] = useState<AdminBranch[]>([])
  const [treatments, setTreatments] = useState<AdminTreatment[]>([])
  const [catalogsError, setCatalogsError] = useState<string | null>(null)

  const [branchId, setBranchId] = useState<number | null>(null)
  const [treatmentId, setTreatmentId] = useState<number | null>(null)
  const [internalCode, setInternalCode] = useState('')
  const [operationalName, setOperationalName] = useState('')
  const [maxCapacity, setMaxCapacity] = useState('')
  const [capacityUnit, setCapacityUnit] = useState('KG')
  const [dailyCapacity, setDailyCapacity] = useState('')
  const [monthlyCapacity, setMonthlyCapacity] = useState('')
  const [environmentalLicenseNumber, setEnvironmentalLicenseNumber] = useState('')
  const [validFrom, setValidFrom] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [requiresManualApproval, setRequiresManualApproval] = useState(false)
  const [allowsMixedWaste, setAllowsMixedWaste] = useState(false)
  const [requiresWeightValidation, setRequiresWeightValidation] = useState(true)
  const [observations, setObservations] = useState('')

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!isAuthorized) return
    fetchTreatments({ status: 'active', perPage: 100 })
      .then((result) => setTreatments(result.data))
      .catch((error) => setCatalogsError(error instanceof Error ? error.message : 'Error inesperado.'))
  }, [isAuthorized])

  // Sedes: para platform staff, solo se cargan una vez elegida la
  // Organización (filtradas a esa organización); para un admin de tenant,
  // el backend ya acota `fetchBranches()` a su propia organización sin
  // necesidad de mandar `organizationId`.
  useEffect(() => {
    if (!isAuthorized) return
    if (isPlatformStaff && !organizationId) {
      setBranches([])
      return
    }
    let cancelled = false
    fetchBranches({ organizationId: isPlatformStaff ? organizationId ?? undefined : undefined, status: 'ACTIVE', perPage: 100 })
      .then((result) => {
        if (cancelled) return
        setBranches(result.data)
      })
      .catch((error) => {
        if (cancelled) return
        setCatalogsError(error instanceof Error ? error.message : 'Error inesperado.')
      })
    return () => {
      cancelled = true
    }
  }, [isAuthorized, isPlatformStaff, organizationId])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    const parsed = createBranchTreatmentSchema.safeParse({
      organizationId: isPlatformStaff ? (organizationId ?? undefined) : undefined,
      branchId: branchId ?? 0,
      treatmentId: treatmentId ?? 0,
      internalCode,
      operationalName,
      maxCapacity: maxCapacity ? Number(maxCapacity) : undefined,
      capacityUnit,
      dailyCapacity: dailyCapacity ? Number(dailyCapacity) : undefined,
      monthlyCapacity: monthlyCapacity ? Number(monthlyCapacity) : undefined,
      environmentalLicenseNumber,
      validFrom,
      validUntil,
      requiresManualApproval,
      allowsMixedWaste,
      requiresWeightValidation,
      observations,
    })

    if (!parsed.success) {
      const errors: FieldErrors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FieldErrors
        errors[key] ??= issue.message
      }
      setFieldErrors(errors)
      return
    }

    if (isPlatformStaff && !parsed.data.organizationId) {
      setFormError('Selecciona la organización dueña del tratamiento de sede.')
      return
    }

    setFieldErrors({})
    setIsSubmitting(true)
    try {
      const { branch_treatment: created } = await createBranchTreatment({
        organization_id: isPlatformStaff ? (parsed.data.organizationId ?? undefined) : undefined,
        branch_id: parsed.data.branchId,
        treatment_id: parsed.data.treatmentId,
        internal_code: parsed.data.internalCode || undefined,
        operational_name: parsed.data.operationalName || undefined,
        max_capacity: parsed.data.maxCapacity,
        capacity_unit: parsed.data.capacityUnit,
        daily_capacity: parsed.data.dailyCapacity,
        monthly_capacity: parsed.data.monthlyCapacity,
        environmental_license_number: parsed.data.environmentalLicenseNumber || undefined,
        valid_from: parsed.data.validFrom || undefined,
        valid_until: parsed.data.validUntil || undefined,
        requires_manual_approval: parsed.data.requiresManualApproval,
        allows_mixed_waste: parsed.data.allowsMixedWaste,
        requires_weight_validation: parsed.data.requiresWeightValidation,
        observations: parsed.data.observations || undefined,
      })
      router.push(`/admin/branch-treatments/${created.id}`)
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setFormError(
          error.firstError('organization_id') ?? error.firstError('branch_id') ?? error.firstError('internal_code') ?? error.message
        )
      } else {
        setFormError(error instanceof Error ? error.message : 'Error inesperado.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isAuthorized) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  return (
    <Card className="w-full max-w-3xl">
      <CardHeader>
        <CardTitle className="text-xl">Crear Tratamiento de Sede</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
          <div className="flex flex-col gap-4">
            <SectionHeading>Identificación</SectionHeading>
            {isPlatformStaff && (
              <OrganizationSearchSelect
                label="Organización"
                htmlId="organizationId"
                capability="can_treat_waste"
                selectedId={organizationId}
                selectedLabel={organizationLabel}
                onSelect={(result) => {
                  setOrganizationId(result.id)
                  setOrganizationLabel(`${result.legal_name} (${result.tax_id})`)
                  setBranchId(null)
                }}
                onClear={() => {
                  setOrganizationId(null)
                  setOrganizationLabel(null)
                  setBranchId(null)
                }}
              />
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="branchId">Sede</Label>
                <Select
                  items={branches.map((branch) => ({ value: String(branch.id), label: branch.name }))}
                  value={branchId !== null ? String(branchId) : null}
                  disabled={isPlatformStaff && !organizationId}
                  onValueChange={(value) => setBranchId(value !== null ? Number(value) : null)}
                >
                  <SelectTrigger id="branchId" aria-invalid={Boolean(fieldErrors.branchId)}>
                    <SelectValue placeholder="Selecciona una sede" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={String(branch.id)}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldErrors.branchId && (
                  <p className="text-xs text-destructive" role="alert">
                    {fieldErrors.branchId}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="treatmentId">Tratamiento</Label>
                <Select
                  items={treatments.map((treatment) => ({ value: String(treatment.id), label: treatment.name }))}
                  value={treatmentId !== null ? String(treatmentId) : null}
                  onValueChange={(value) => setTreatmentId(value !== null ? Number(value) : null)}
                >
                  <SelectTrigger id="treatmentId" aria-invalid={Boolean(fieldErrors.treatmentId)}>
                    <SelectValue placeholder="Selecciona un tratamiento" />
                  </SelectTrigger>
                  <SelectContent>
                    {treatments.map((treatment) => (
                      <SelectItem key={treatment.id} value={String(treatment.id)}>
                        {treatment.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldErrors.treatmentId && (
                  <p className="text-xs text-destructive" role="alert">
                    {fieldErrors.treatmentId}
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="internalCode">
                  Código Interno <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input id="internalCode" value={internalCode} onChange={(event) => setInternalCode(event.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="operationalName">
                  Nombre Operativo <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="operationalName"
                  value={operationalName}
                  onChange={(event) => setOperationalName(event.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <SectionHeading>Capacidad</SectionHeading>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="maxCapacity">
                  Capacidad Máxima <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="maxCapacity"
                  type="number"
                  min={0}
                  value={maxCapacity}
                  onChange={(event) => setMaxCapacity(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="capacityUnit">Unidad</Label>
                <Input id="capacityUnit" value={capacityUnit} onChange={(event) => setCapacityUnit(event.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dailyCapacity">
                  Capacidad Diaria <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="dailyCapacity"
                  type="number"
                  min={0}
                  value={dailyCapacity}
                  onChange={(event) => setDailyCapacity(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="monthlyCapacity">
                  Capacidad Mensual <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="monthlyCapacity"
                  type="number"
                  min={0}
                  value={monthlyCapacity}
                  onChange={(event) => setMonthlyCapacity(event.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <SectionHeading>Vigencia y Licencia</SectionHeading>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="environmentalLicenseNumber">
                  Nº Licencia Ambiental <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="environmentalLicenseNumber"
                  value={environmentalLicenseNumber}
                  onChange={(event) => setEnvironmentalLicenseNumber(event.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="validFrom">
                  Vigente Desde <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input id="validFrom" type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="validUntil">
                  Vigente Hasta <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="validUntil"
                  type="date"
                  value={validUntil}
                  onChange={(event) => setValidUntil(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.validUntil)}
                />
                {fieldErrors.validUntil && (
                  <p className="text-xs text-destructive" role="alert">
                    {fieldErrors.validUntil}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <SectionHeading>Configuración Operativa</SectionHeading>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="requiresManualApproval"
                  checked={requiresManualApproval}
                  onCheckedChange={(checked) => setRequiresManualApproval(checked === true)}
                />
                <Label htmlFor="requiresManualApproval" className="font-normal">
                  Requiere aprobación manual
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="allowsMixedWaste"
                  checked={allowsMixedWaste}
                  onCheckedChange={(checked) => setAllowsMixedWaste(checked === true)}
                />
                <Label htmlFor="allowsMixedWaste" className="font-normal">
                  Permite mezcla de residuos
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="requiresWeightValidation"
                  checked={requiresWeightValidation}
                  onCheckedChange={(checked) => setRequiresWeightValidation(checked === true)}
                />
                <Label htmlFor="requiresWeightValidation" className="font-normal">
                  Requiere validación de peso
                </Label>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="observations">
                Observaciones <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <textarea
                id="observations"
                className="min-h-20 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={observations}
                onChange={(event) => setObservations(event.target.value)}
              />
            </div>
          </div>

          {catalogsError && (
            <p className="text-sm text-destructive" role="alert" aria-live="polite">
              No se pudieron cargar los catálogos de Sedes/Tratamientos: {catalogsError}
            </p>
          )}

          {formError && (
            <p className="text-sm text-destructive" role="alert" aria-live="polite">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push('/admin/branch-treatments')}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creando…' : 'Crear Tratamiento de Sede'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
