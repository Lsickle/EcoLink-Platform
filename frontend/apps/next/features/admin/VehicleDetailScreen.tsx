'use client'

import { useEffect, useRef, useState } from 'react'
import { Truck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ApiValidationError,
  activateVehicle,
  deactivateVehicle,
  fetchVehicle,
  fetchVehicleActivity,
  fetchVehicleTypes,
  updateVehicle,
  type AdminVehicleDetail,
  type AdminVehicleType,
  type RoleActivityEvent,
  type VehicleOperationalStatus,
} from 'app/features/admin/api'
import { formatDate } from 'app/features/admin/formatDate'
import { useRequireAuth } from 'app/provider/auth'

const STATUS_LABELS: Record<VehicleOperationalStatus, string> = {
  ACTIVE: 'Operativo',
  OUT_OF_SERVICE: 'Fuera de Servicio',
  MAINTENANCE: 'En Mantenimiento',
}

const STATUS_BADGE_VARIANT: Record<VehicleOperationalStatus, 'default' | 'secondary' | 'destructive'> = {
  ACTIVE: 'default',
  OUT_OF_SERVICE: 'destructive',
  MAINTENANCE: 'secondary',
}

function errorMessage(error: unknown, key: string): string {
  if (error instanceof ApiValidationError) {
    return error.firstError(key) ?? error.message
  }
  return error instanceof Error ? error.message : 'Error inesperado.'
}

function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  )
}

// Plan "CRUD de Vehículos" (CU-051.1/.2/.3/.4) -- mismo layout de 2 columnas
// que BranchDetailScreen.tsx. Header con badges Estado Operativo/RESPEL/GPS
// + Editar/Activar-Inactivar (`operational_status`/`is_active` se gestionan
// vía activate()/deactivate(), no vía el form de "Información General",
// mismo criterio granular ya usado en Sedes). Sin las tabs
// Documentación/Operación/Mantenimientos/Incidencias/Historial del wireframe
// de Figma -- recortadas porque el backend de este lote solo expone
// `GET /vehicles/{id}/activity` (ver docblock de VehicleController), no hay
// endpoint que calcule viajes/km recorridos/mantenimientos/incidencias ni
// vigencia de SOAT/tecnomecánica -- solo una tab real "Actividad", con carga
// perezosa (mismo patrón `xLoaded` fuera de las dependencias del efecto que
// BranchDetailScreen.tsx).
export function VehicleDetailScreen({ vehicleId }: { vehicleId: number | string }) {
  const { isAuthorized } = useRequireAuth('vehicles.read')
  const [vehicle, setVehicle] = useState<AdminVehicleDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const infoCardRef = useRef<HTMLDivElement | null>(null)

  const [vehicleTypes, setVehicleTypes] = useState<AdminVehicleType[]>([])

  // Formulario de edición (sección "Información General")
  const [vehicleTypeId, setVehicleTypeId] = useState<number | null>(null)
  const [code, setCode] = useState('')
  const [plateNumber, setPlateNumber] = useState('')
  const [vin, setVin] = useState('')
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [manufacturingYear, setManufacturingYear] = useState('')
  const [maxLoadCapacity, setMaxLoadCapacity] = useState('')
  const [capacityUnit, setCapacityUnit] = useState('KG')
  const [supportsHazmat, setSupportsHazmat] = useState(false)
  const [hasGps, setHasGps] = useState(false)
  const [soatExpirationDate, setSoatExpirationDate] = useState('')
  const [technicalInspectionExpiration, setTechnicalInspectionExpiration] = useState('')

  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [isTogglingActive, setIsTogglingActive] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<'general' | 'auditoria'>('general')

  const [activityEvents, setActivityEvents] = useState<RoleActivityEvent[]>([])
  const [activityLoaded, setActivityLoaded] = useState(false)
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    Promise.all([fetchVehicle(vehicleId), fetchVehicleTypes({ perPage: 100, status: 'active' })])
      .then(([vehicleResult, vehicleTypesResult]) => {
        if (cancelled) return
        const v = vehicleResult.vehicle
        setVehicle(v)
        setVehicleTypes(vehicleTypesResult.data)
        setVehicleTypeId(v.vehicle_type_id)
        setCode(v.code ?? '')
        setPlateNumber(v.plate_number)
        setVin(v.vin ?? '')
        setBrand(v.brand ?? '')
        setModel(v.model ?? '')
        setManufacturingYear(v.manufacturing_year != null ? String(v.manufacturing_year) : '')
        setMaxLoadCapacity(v.max_load_capacity != null ? String(v.max_load_capacity) : '')
        setCapacityUnit(v.capacity_unit)
        setSupportsHazmat(v.supports_hazmat)
        setHasGps(v.has_gps)
        setSoatExpirationDate(v.soat_expiration_date ?? '')
        setTechnicalInspectionExpiration(v.technical_inspection_expiration ?? '')
      })
      .catch((error) => {
        if (cancelled) return
        setLoadError(error instanceof Error ? error.message : 'Error inesperado.')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isAuthorized, vehicleId])

  useEffect(() => {
    if (activeTab !== 'auditoria' || activityLoaded || !isAuthorized) return
    let cancelled = false
    setActivityLoading(true)
    fetchVehicleActivity(vehicleId, { perPage: 15 })
      .then((result) => {
        if (cancelled) return
        setActivityEvents(result.data)
        setActivityLoaded(true)
        setActivityError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setActivityError(error instanceof Error ? error.message : 'Error inesperado.')
      })
      .finally(() => {
        if (!cancelled) setActivityLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isAuthorized, vehicleId])

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    if (!vehicle || vehicleTypeId === null) return
    setSaveError(null)
    setSaveMessage(null)
    setIsSaving(true)
    try {
      const { vehicle: updated } = await updateVehicle(vehicle.id, {
        code: code || undefined,
        plate_number: plateNumber,
        vin: vin || undefined,
        vehicle_type_id: vehicleTypeId,
        brand: brand || undefined,
        model: model || undefined,
        manufacturing_year: manufacturingYear ? Number(manufacturingYear) : undefined,
        max_load_capacity: maxLoadCapacity ? Number(maxLoadCapacity) : undefined,
        capacity_unit: capacityUnit,
        supports_hazmat: supportsHazmat,
        has_gps: hasGps,
        soat_expiration_date: soatExpirationDate || undefined,
        technical_inspection_expiration: technicalInspectionExpiration || undefined,
      })
      // updateVehicle() devuelve organization/vehicle_type (id/name) recargados
      // pero NO branch/created_by/updated_by (ver docblock de AdminVehicle en
      // types.ts) -- se preservan los ya cargados de show().
      setVehicle((current) =>
        current
          ? {
              ...current,
              ...updated,
              organization: updated.organization ?? current.organization,
              vehicle_type: current.vehicle_type,
              branch: current.branch,
              created_by: current.created_by,
              updated_by: current.updated_by,
            }
          : current
      )
      setSaveMessage('Cambios guardados.')
    } catch (error) {
      setSaveError(errorMessage(error, 'plate_number'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleActive() {
    if (!vehicle) return
    setToggleError(null)
    setIsTogglingActive(true)
    try {
      const { vehicle: updated } = vehicle.is_active ? await deactivateVehicle(vehicle.id) : await activateVehicle(vehicle.id)
      setVehicle((current) =>
        current ? { ...current, is_active: updated.is_active, operational_status: updated.operational_status } : current
      )
    } catch (error) {
      setToggleError(errorMessage(error, 'vehicle'))
    } finally {
      setIsTogglingActive(false)
    }
  }

  if (!isAuthorized || isLoading) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  if (loadError || !vehicle) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError ?? 'No se encontró el vehículo.'}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden py-0">
        <CardHeader className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
              <Truck className="size-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl">{vehicle.plate_number}</CardTitle>
                {vehicle.vehicle_type && <Badge variant="outline">{vehicle.vehicle_type.name}</Badge>}
                {vehicle.supports_hazmat && <Badge variant="outline">RESPEL</Badge>}
                {vehicle.has_gps && <Badge variant="outline">GPS</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">
                {vehicle.code ?? '—'} · {vehicle.organization.legal_name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_BADGE_VARIANT[vehicle.operational_status]}>
              {STATUS_LABELS[vehicle.operational_status]}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => infoCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              Editar
            </Button>
            <Button variant="outline" size="sm" disabled={isTogglingActive} onClick={handleToggleActive}>
              {vehicle.is_active ? 'Inactivar' : 'Activar'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          {toggleError && (
            <p className="text-sm text-destructive" role="alert">
              {toggleError}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          <Card ref={infoCardRef}>
            <CardHeader>
              <CardTitle className="text-base">Información General</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
                <InfoField label="Organización">{vehicle.organization.legal_name}</InfoField>
                <InfoField label="Sede">{vehicle.branch?.name ?? '—'}</InfoField>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="plateNumber">Placa</Label>
                  <Input id="plateNumber" value={plateNumber} onChange={(event) => setPlateNumber(event.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="code">
                    Código Interno <span className="text-muted-foreground">(opcional)</span>
                  </Label>
                  <Input id="code" value={code} onChange={(event) => setCode(event.target.value)} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="vehicleTypeId">Tipo de Vehículo</Label>
                  <Select
                    items={vehicleTypes.map((type) => ({ value: String(type.id), label: type.name }))}
                    value={vehicleTypeId !== null ? String(vehicleTypeId) : null}
                    onValueChange={(value) => setVehicleTypeId(value !== null ? Number(value) : null)}
                  >
                    <SelectTrigger id="vehicleTypeId">
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
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="vin">
                    VIN <span className="text-muted-foreground">(opcional)</span>
                  </Label>
                  <Input id="vin" value={vin} onChange={(event) => setVin(event.target.value)} />
                </div>

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

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="manufacturingYear">
                    Año de Fabricación <span className="text-muted-foreground">(opcional)</span>
                  </Label>
                  <Input
                    id="manufacturingYear"
                    type="number"
                    value={manufacturingYear}
                    onChange={(event) => setManufacturingYear(event.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
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
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="capacityUnit">Unidad</Label>
                    <Input id="capacityUnit" value={capacityUnit} onChange={(event) => setCapacityUnit(event.target.value)} />
                  </div>
                </div>

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

                <InfoField label="Fecha de Creación">{formatDate(vehicle.created_at)}</InfoField>
                <InfoField label="Creado Por">{vehicle.created_by?.username ?? '—'}</InfoField>

                {saveError && (
                  <p className="text-sm text-destructive sm:col-span-2" role="alert">
                    {saveError}
                  </p>
                )}
                {saveMessage && (
                  <p className="text-sm text-muted-foreground sm:col-span-2" role="status">
                    {saveMessage}
                  </p>
                )}

                <div className="flex justify-end sm:col-span-2">
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? 'Guardando…' : 'Guardar cambios'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
                <TabsList>
                  <TabsTrigger value="general">General</TabsTrigger>
                  <TabsTrigger value="auditoria">Actividad</TabsTrigger>
                </TabsList>

                <TabsContent value="general" className="pt-4 text-sm text-muted-foreground">
                  {vehicle.max_load_capacity != null
                    ? `Capacidad máxima: ${vehicle.max_load_capacity} ${vehicle.capacity_unit}.`
                    : 'Sin capacidad máxima registrada.'}
                </TabsContent>

                <TabsContent value="auditoria" className="flex flex-col gap-3 pt-4">
                  {activityError && (
                    <p className="text-sm text-destructive" role="alert">
                      {activityError}
                    </p>
                  )}
                  {activityLoading && activityEvents.length === 0 && !activityLoaded ? (
                    <p className="text-sm text-muted-foreground" role="status">
                      Cargando…
                    </p>
                  ) : activityEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin actividad registrada.</p>
                  ) : (
                    <ol className="flex flex-col gap-4 border-l border-border pl-4">
                      {activityEvents.map((event, index) => (
                        <li key={`${event.created_at}-${index}`} className="relative">
                          <span className="absolute -left-[21px] top-1 size-2.5 rounded-full bg-primary" aria-hidden="true" />
                          <p className="text-sm">{event.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(event.created_at)}
                            {event.actor ? ` · ${event.actor.username}` : ''}
                          </p>
                        </li>
                      ))}
                    </ol>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resumen</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3">
              <div className="flex flex-col gap-1 rounded-lg border border-border p-3">
                <span className="text-xs text-muted-foreground">SOAT</span>
                <span className="text-sm font-medium">
                  {vehicle.soat_expiration_date ? formatDate(vehicle.soat_expiration_date) : 'Sin registrar'}
                </span>
              </div>
              <div className="flex flex-col gap-1 rounded-lg border border-border p-3">
                <span className="text-xs text-muted-foreground">Tecnomecánica</span>
                <span className="text-sm font-medium">
                  {vehicle.technical_inspection_expiration ? formatDate(vehicle.technical_inspection_expiration) : 'Sin registrar'}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
