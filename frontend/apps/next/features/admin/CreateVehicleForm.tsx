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
  createVehicle,
  fetchVehicleTypes,
  type AdminVehicleType,
} from 'app/features/admin/api'
import { createVehicleSchema } from 'app/features/admin/schemas'
import { useAuth, useRequireAuth } from 'app/provider/auth'
import { OrganizationSearchSelect } from './OrganizationSearchSelect'

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-foreground">{children}</h3>
}

type FieldErrors = Partial<Record<'plateNumber' | 'vehicleTypeId' | 'manufacturingYear' | 'maxLoadCapacity' | 'capacityUnit', string>>

// Formulario de creación (POST /api/admin/vehicles) -- CU-051.1/.3, mismo
// mecanismo EXACTO que CreateBranchForm.tsx. El selector de Organización
// dueña SOLO se muestra si `user.is_platform_staff` (para cualquier otro
// actor el backend fuerza su propia organización server-side). A DIFERENCIA
// de otros formularios con selector de organización en el proyecto: aquí NO
// se filtra por tipo de organización (business_role) -- decisión de negocio
// confirmada por el usuario, desviación deliberada de RN-090 tal como está
// escrita hoy (cualquier organización puede registrar vehículos), ver
// docblock de `VehicleController`.
export function CreateVehicleForm() {
  const router = useRouter()
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth('vehicles.create')
  const isPlatformStaff = Boolean(user?.is_platform_staff)

  const [vehicleTypes, setVehicleTypes] = useState<AdminVehicleType[]>([])
  const [catalogsError, setCatalogsError] = useState<string | null>(null)

  // Identificación
  const [organizationId, setOrganizationId] = useState<number | null>(null)
  const [organizationLabel, setOrganizationLabel] = useState<string | null>(null)
  const [vehicleTypeId, setVehicleTypeId] = useState<number | null>(null)
  const [code, setCode] = useState('')
  const [plateNumber, setPlateNumber] = useState('')
  const [vin, setVin] = useState('')

  // Especificaciones
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [manufacturingYear, setManufacturingYear] = useState('')
  const [maxLoadCapacity, setMaxLoadCapacity] = useState('')
  const [capacityUnit, setCapacityUnit] = useState('KG')
  const [supportsHazmat, setSupportsHazmat] = useState(false)
  const [hasGps, setHasGps] = useState(false)

  // Documentación
  const [soatExpirationDate, setSoatExpirationDate] = useState('')
  const [technicalInspectionExpiration, setTechnicalInspectionExpiration] = useState('')

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    fetchVehicleTypes({ perPage: 100, status: 'active' })
      .then((result) => {
        if (cancelled) return
        setVehicleTypes(result.data)
        setCatalogsError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setCatalogsError(error instanceof Error ? error.message : 'Error inesperado.')
      })
    return () => {
      cancelled = true
    }
  }, [isAuthorized])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    const parsed = createVehicleSchema.safeParse({
      organizationId: isPlatformStaff ? (organizationId ?? undefined) : undefined,
      code,
      plateNumber,
      vin,
      vehicleTypeId: vehicleTypeId ?? 0,
      brand,
      model,
      manufacturingYear: manufacturingYear ? Number(manufacturingYear) : undefined,
      maxLoadCapacity: maxLoadCapacity ? Number(maxLoadCapacity) : undefined,
      capacityUnit,
      supportsHazmat,
      hasGps,
      soatExpirationDate,
      technicalInspectionExpiration,
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
      setFormError('Selecciona la organización dueña del vehículo.')
      return
    }

    setFieldErrors({})
    setIsSubmitting(true)
    try {
      const { vehicle: created } = await createVehicle({
        organization_id: isPlatformStaff ? (parsed.data.organizationId ?? undefined) : undefined,
        code: parsed.data.code || undefined,
        plate_number: parsed.data.plateNumber,
        vin: parsed.data.vin || undefined,
        vehicle_type_id: parsed.data.vehicleTypeId,
        brand: parsed.data.brand || undefined,
        model: parsed.data.model || undefined,
        manufacturing_year: parsed.data.manufacturingYear,
        max_load_capacity: parsed.data.maxLoadCapacity,
        capacity_unit: parsed.data.capacityUnit,
        supports_hazmat: parsed.data.supportsHazmat,
        has_gps: parsed.data.hasGps,
        soat_expiration_date: parsed.data.soatExpirationDate || undefined,
        technical_inspection_expiration: parsed.data.technicalInspectionExpiration || undefined,
      })
      router.push(`/admin/vehicles/${created.id}`)
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setFormError(
          error.firstError('plate_number') ?? error.firstError('vin') ?? error.firstError('code') ?? error.message
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
        <CardTitle className="text-xl">Crear Vehículo</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
          <div className="flex flex-col gap-4">
            <SectionHeading>Identificación</SectionHeading>
            {isPlatformStaff && (
              <OrganizationSearchSelect
                label="Organización dueña"
                htmlId="organizationId"
                selectedId={organizationId}
                selectedLabel={organizationLabel}
                onSelect={(result) => {
                  setOrganizationId(result.id)
                  setOrganizationLabel(`${result.legal_name} (${result.tax_id})`)
                }}
                onClear={() => {
                  setOrganizationId(null)
                  setOrganizationLabel(null)
                }}
              />
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="plateNumber">Placa</Label>
                <Input
                  id="plateNumber"
                  value={plateNumber}
                  onChange={(event) => setPlateNumber(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.plateNumber)}
                />
                {fieldErrors.plateNumber && (
                  <p className="text-xs text-destructive" role="alert">
                    {fieldErrors.plateNumber}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="code">
                  Código Interno <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input id="code" value={code} onChange={(event) => setCode(event.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="vehicleTypeId">Tipo de Vehículo</Label>
                <Select
                  items={vehicleTypes.map((type) => ({ value: String(type.id), label: type.name }))}
                  value={vehicleTypeId !== null ? String(vehicleTypeId) : null}
                  onValueChange={(value) => setVehicleTypeId(value !== null ? Number(value) : null)}
                >
                  <SelectTrigger id="vehicleTypeId" aria-invalid={Boolean(fieldErrors.vehicleTypeId)}>
                    <SelectValue placeholder="Selecciona un tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicleTypes.map((type) => (
                      <SelectItem key={type.id} value={String(type.id)}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldErrors.vehicleTypeId && (
                  <p className="text-xs text-destructive" role="alert">
                    {fieldErrors.vehicleTypeId}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="vin">
                  VIN <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input id="vin" value={vin} onChange={(event) => setVin(event.target.value)} />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <SectionHeading>Especificaciones</SectionHeading>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="brand">
                  Marca <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input id="brand" value={brand} onChange={(event) => setBrand(event.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="model">
                  Modelo <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input id="model" value={model} onChange={(event) => setModel(event.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="manufacturingYear">
                  Año de Fabricación <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="manufacturingYear"
                  type="number"
                  value={manufacturingYear}
                  onChange={(event) => setManufacturingYear(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.manufacturingYear)}
                />
                {fieldErrors.manufacturingYear && (
                  <p className="text-xs text-destructive" role="alert">
                    {fieldErrors.manufacturingYear}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="maxLoadCapacity">
                  Cap. Máxima <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="maxLoadCapacity"
                  type="number"
                  min={0}
                  value={maxLoadCapacity}
                  onChange={(event) => setMaxLoadCapacity(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.maxLoadCapacity)}
                />
                {fieldErrors.maxLoadCapacity && (
                  <p className="text-xs text-destructive" role="alert">
                    {fieldErrors.maxLoadCapacity}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="capacityUnit">Unidad</Label>
                <Input id="capacityUnit" value={capacityUnit} onChange={(event) => setCapacityUnit(event.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="supportsHazmat"
                  checked={supportsHazmat}
                  onCheckedChange={(checked) => setSupportsHazmat(checked === true)}
                />
                <Label htmlFor="supportsHazmat" className="font-normal">
                  Habilitado para transporte RESPEL
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="hasGps" checked={hasGps} onCheckedChange={(checked) => setHasGps(checked === true)} />
                <Label htmlFor="hasGps" className="font-normal">
                  Cuenta con GPS
                </Label>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <SectionHeading>Documentación</SectionHeading>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="soatExpirationDate">
                  Vencimiento SOAT <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="soatExpirationDate"
                  type="date"
                  value={soatExpirationDate}
                  onChange={(event) => setSoatExpirationDate(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="technicalInspectionExpiration">
                  Vencimiento Tecnomecánica <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="technicalInspectionExpiration"
                  type="date"
                  value={technicalInspectionExpiration}
                  onChange={(event) => setTechnicalInspectionExpiration(event.target.value)}
                />
              </div>
            </div>
          </div>

          {catalogsError && (
            <p className="text-sm text-destructive" role="alert" aria-live="polite">
              No se pudo cargar el catálogo de Tipos de Vehículo: {catalogsError}
            </p>
          )}

          {formError && (
            <p className="text-sm text-destructive" role="alert" aria-live="polite">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push('/admin/vehicles')}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creando…' : 'Crear Vehículo'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
