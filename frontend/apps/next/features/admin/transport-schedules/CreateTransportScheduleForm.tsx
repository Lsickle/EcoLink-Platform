'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ApiValidationError,
  createTransportSchedule,
  fetchBranches,
  fetchServiceRequest,
  fetchServiceRequests,
  fetchTransportPersonnel,
  fetchVehicles,
  type AdminBranch,
  type AdminServiceRequest,
  type AdminServiceRequestDetail,
  type AdminServiceRequestItem,
  type AdminServiceRequestItemReduced,
  type AdminTransportPersonnel,
  type AdminVehicle,
} from 'app/features/admin/api'
import { createTransportScheduleSchema } from 'app/features/admin/schemas'
import { useAuth, useRequireAuth } from 'app/provider/auth'
import { OrganizationSearchSelect } from '../OrganizationSearchSelect'

const SEARCH_DEBOUNCE_MS = 300

// Mismo AVISO que `PRIORITY_OPTIONS` de `ServiceRequestWizard.tsx`: sin
// catálogo FK ni whitelist server-side (`priority` es VARCHAR(20) libre en
// `transport_schedules`) -- se reutilizan LITERALMENTE los mismos 4 valores
// del dominio hermano (Solicitudes de Servicio) por consistencia, no porque
// estén confirmados como canónicos para Programación de Transporte.
const PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Baja' },
  { value: 'MEDIUM', label: 'Media' },
  { value: 'HIGH', label: 'Alta' },
  { value: 'CRITICAL', label: 'Crítica' },
]

function errorMessage(error: unknown, key: string): string {
  if (error instanceof ApiValidationError) {
    return error.firstError(key) ?? error.message
  }
  return error instanceof Error ? error.message : 'Error inesperado.'
}

function isFullServiceRequestItem(
  item: AdminServiceRequestItem | AdminServiceRequestItemReduced
): item is AdminServiceRequestItem {
  return 'waste_id' in item
}

type SelectedItemState = { itemId: number; quantity: string }

/**
 * Creación de `transport_schedules` (CU-026, Módulo Programación Logística
 * Fase 2a). `vehicle_id`/`transport_personnel_id` son OBLIGATORIOS desde la
 * creación (D-PRG-03) -- mismo criterio de "sin Borrador de solo cabecera"
 * que `ServiceRequestWizard.tsx` exige `items` desde el Paso 6.
 *
 * Flujo: (1) buscar y seleccionar la Solicitud de Servicio de origen (mismo
 * criterio de propiedad que `ServiceRequestController::index()` -- el
 * backend ya solo devuelve solicitudes donde el actor tiene al menos un
 * ítem propio asignado, sin filtro adicional en cliente); (2) elegir entre
 * sus ítems con `item_status=ACCEPTED` que pertenezcan a la organización
 * actora (mismo criterio anti-IDOR que
 * `TransportScheduleController::resolveAndValidateItems()`); (3) vehículo
 * (reutiliza `fetchVehicles()`), conductor (reutiliza
 * `fetchTransportPersonnel()`, cierre del gap de contrato señalado en el
 * lote anterior -- mismo patrón de selector que Vehículo, filtrado por la
 * organización actora e `isActive: true`) y sede de destino (reutiliza
 * `fetchBranches()`).
 *
 * "Ítems elegibles para programar" -- NO existe un endpoint dedicado
 * (también señalado como gap posible en la tarea); se resuelve reutilizando
 * `fetchServiceRequests()`/`fetchServiceRequest()` ya existentes (el
 * `index()` de Solicitudes YA filtra por propiedad del actor) + un filtro en
 * cliente por `item_status.code === 'ACCEPTED'` y pertenencia de la
 * aprobación a la organización actora -- enfoque documentado explícitamente
 * en vez de asumido en silencio.
 */
export function CreateTransportScheduleForm() {
  const router = useRouter()
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth('transport_schedules.create')
  const isPlatformStaff = Boolean(user?.is_platform_staff)

  const [organizationId, setOrganizationId] = useState<number | null>(null)
  const [organizationLabel, setOrganizationLabel] = useState<string | null>(null)
  const effectiveOrganizationId = isPlatformStaff ? organizationId : (user?.tenant_organization_id ?? null)

  // Búsqueda de Solicitud de Servicio de origen
  const [requestSearch, setRequestSearch] = useState('')
  const [requestResults, setRequestResults] = useState<AdminServiceRequest[]>([])
  const [selectedRequest, setSelectedRequest] = useState<AdminServiceRequestDetail | null>(null)
  const [isLoadingRequestDetail, setIsLoadingRequestDetail] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)

  // Ítems seleccionados (clave = waste_service_request_item_id)
  const [selectedItems, setSelectedItems] = useState<Record<number, SelectedItemState>>({})

  // Vehículo / conductor / sede de destino
  const [vehicles, setVehicles] = useState<AdminVehicle[]>([])
  const [vehicleId, setVehicleId] = useState<number | null>(null)
  const [personnel, setPersonnel] = useState<AdminTransportPersonnel[]>([])
  const [transportPersonnelId, setTransportPersonnelId] = useState<number | null>(null)
  const [branches, setBranches] = useState<AdminBranch[]>([])
  const [destinationBranchId, setDestinationBranchId] = useState<number | null>(null)
  const [catalogsError, setCatalogsError] = useState<string | null>(null)

  // Resto de la cabecera
  const [scheduledPickupAt, setScheduledPickupAt] = useState('')
  const [priority, setPriority] = useState('MEDIUM')
  const [requiresSpecialHandling, setRequiresSpecialHandling] = useState(false)
  const [observations, setObservations] = useState('')

  const [fieldErrors, setFieldErrors] = useState<Partial<Record<string, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!isAuthorized || effectiveOrganizationId == null) return
    let cancelled = false
    Promise.all([
      fetchVehicles({ organizationId: effectiveOrganizationId, perPage: 100, operationalStatus: 'ACTIVE' }),
      fetchTransportPersonnel({ organizationId: effectiveOrganizationId, perPage: 100, isActive: true }),
      fetchBranches({ organizationId: effectiveOrganizationId, perPage: 100 }),
    ])
      .then(([vehiclesResult, personnelResult, branchesResult]) => {
        if (cancelled) return
        setVehicles(vehiclesResult.data)
        setPersonnel(personnelResult.data)
        setBranches(branchesResult.data)
        setCatalogsError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setCatalogsError(error instanceof Error ? error.message : 'Error inesperado.')
      })
    return () => {
      cancelled = true
    }
  }, [isAuthorized, effectiveOrganizationId])

  useEffect(() => {
    if (!requestSearch.trim()) {
      setRequestResults([])
      return
    }
    const timeout = setTimeout(() => {
      // Sin filtro `status` a propósito: `ServiceRequestApprovalService::
      // recalculateHeaderStatus()` mueve la cabecera a REJECTED apenas
      // CUALQUIER ítem queda REJECTED (D-S01), aunque OTRO ítem de la misma
      // solicitud ya esté ACCEPTED y sea legítimamente programable -- filtrar
      // por `status: 'APPROVED'` aquí ocultaría esos casos. La elegibilidad
      // real se decide 100% a nivel de ítem (`eligibleItems` más abajo),
      // igual que hace el backend (`TransportScheduleController::
      // resolveAndValidateItems()`), nunca a nivel de cabecera.
      fetchServiceRequests({
        search: requestSearch.trim(),
        perPage: 10,
        organizationId: isPlatformStaff && effectiveOrganizationId ? effectiveOrganizationId : undefined,
      })
        .then((result) => setRequestResults(result.data))
        .catch(() => setRequestResults([]))
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [requestSearch, isPlatformStaff, effectiveOrganizationId])

  function handleSelectRequest(requestId: number) {
    setRequestError(null)
    setIsLoadingRequestDetail(true)
    setRequestResults([])
    setRequestSearch('')
    fetchServiceRequest(requestId)
      .then((result) => {
        setSelectedRequest(result.service_request)
        setSelectedItems({})
      })
      .catch((error) => {
        setRequestError(error instanceof Error ? error.message : 'Error inesperado.')
      })
      .finally(() => setIsLoadingRequestDetail(false))
  }

  const eligibleItems = (selectedRequest?.items ?? []).filter(
    (item): item is AdminServiceRequestItem =>
      isFullServiceRequestItem(item) &&
      item.item_status?.code === 'ACCEPTED' &&
      (effectiveOrganizationId == null || item.waste_treatment_approval?.organization?.id === effectiveOrganizationId)
  )

  function toggleItem(item: AdminServiceRequestItem) {
    setSelectedItems((current) => {
      const next = { ...current }
      if (next[item.id]) {
        delete next[item.id]
      } else {
        next[item.id] = { itemId: item.id, quantity: item.estimated_quantity != null ? String(item.estimated_quantity) : '' }
      }
      return next
    })
  }

  function setItemQuantity(itemId: number, quantity: string) {
    setSelectedItems((current) => ({ ...current, [itemId]: { ...current[itemId], quantity } }))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    const itemsPayload = Object.values(selectedItems).map((entry) => ({
      wasteServiceRequestItemId: entry.itemId,
      scheduledQuantity: Number(entry.quantity || 0),
    }))

    const parsed = createTransportScheduleSchema.safeParse({
      organizationId: isPlatformStaff ? (organizationId ?? undefined) : undefined,
      wasteServiceRequestId: selectedRequest?.id ?? 0,
      vehicleId: vehicleId ?? 0,
      transportPersonnelId: transportPersonnelId ?? 0,
      sourceBranchId: selectedRequest?.branch?.id ?? 0,
      destinationBranchId: destinationBranchId ?? 0,
      scheduledPickupAt,
      priority,
      requiresSpecialHandling,
      observations,
      items: itemsPayload,
    })

    if (!parsed.success) {
      const errors: Partial<Record<string, string>> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0])
        errors[key] ??= issue.message
      }
      setFieldErrors(errors)
      return
    }

    setFieldErrors({})
    setIsSubmitting(true)
    try {
      const { transport_schedule: created } = await createTransportSchedule({
        organization_id: isPlatformStaff ? (parsed.data.organizationId ?? undefined) : undefined,
        waste_service_request_id: parsed.data.wasteServiceRequestId,
        vehicle_id: parsed.data.vehicleId,
        transport_personnel_id: parsed.data.transportPersonnelId,
        source_branch_id: parsed.data.sourceBranchId,
        destination_branch_id: parsed.data.destinationBranchId,
        scheduled_pickup_at: parsed.data.scheduledPickupAt,
        priority: parsed.data.priority || undefined,
        requires_special_handling: parsed.data.requiresSpecialHandling,
        observations: parsed.data.observations || undefined,
        items: parsed.data.items.map((item) => ({
          waste_service_request_item_id: item.wasteServiceRequestItemId,
          scheduled_quantity: item.scheduledQuantity,
        })),
      })
      router.push(`/admin/transport-schedules/${created.id}`)
    } catch (error) {
      setFormError(errorMessage(error, 'items'))
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
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle className="text-xl">Nueva Programación de Recolección</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
          {isPlatformStaff && (
            <OrganizationSearchSelect
              label="Organización que programa"
              htmlId="transportScheduleOrganizationId"
              capability="can_transport_waste"
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

          <div className="flex flex-col gap-2">
            <Label htmlFor="requestSearch">Solicitud de Servicio de Origen</Label>
            {selectedRequest ? (
              <div className="flex items-center gap-2">
                <span className="rounded-md border border-border px-2.5 py-1.5 text-sm">
                  {selectedRequest.request_code} · {selectedRequest.branch.name}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedRequest(null)
                    setSelectedItems({})
                  }}
                >
                  Quitar
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  id="requestSearch"
                  placeholder="Buscar por código de solicitud…"
                  value={requestSearch}
                  onChange={(event) => setRequestSearch(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.wasteServiceRequestId)}
                />
                {requestResults.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
                    {requestResults.map((result) => (
                      <li key={result.id}>
                        <button
                          type="button"
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                          onClick={() => handleSelectRequest(result.id)}
                        >
                          {result.request_code} <span className="text-muted-foreground">({result.branch?.name ?? '—'})</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {fieldErrors.wasteServiceRequestId && (
              <p className="text-xs text-destructive" role="alert">
                {fieldErrors.wasteServiceRequestId}
              </p>
            )}
            {requestError && (
              <p className="text-sm text-destructive" role="alert">
                {requestError}
              </p>
            )}
          </div>

          {isLoadingRequestDetail && (
            <p className="text-sm text-muted-foreground" role="status">
              Cargando ítems de la solicitud…
            </p>
          )}

          {selectedRequest && !isLoadingRequestDetail && (
            <div className="flex flex-col gap-2">
              <Label>Ítems Aceptados a Programar</Label>
              {eligibleItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Esta solicitud no tiene ítems Aceptados pendientes de programar para su organización.
                </p>
              ) : (
                <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead />
                        <TableHead>Residuo</TableHead>
                        <TableHead>Cantidad a Programar</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {eligibleItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Checkbox
                              checked={Boolean(selectedItems[item.id])}
                              onCheckedChange={() => toggleItem(item)}
                              aria-label={`Seleccionar ítem ${item.waste_name_snapshot}`}
                            />
                          </TableCell>
                          <TableCell>{item.waste_name_snapshot}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              disabled={!selectedItems[item.id]}
                              value={selectedItems[item.id]?.quantity ?? ''}
                              onChange={(event) => setItemQuantity(item.id, event.target.value)}
                              aria-label={`Cantidad a programar para ${item.waste_name_snapshot}`}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {fieldErrors.items && (
                <p className="text-xs text-destructive" role="alert">
                  {fieldErrors.items}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vehicleId">Vehículo</Label>
              <Select
                items={vehicles.map((vehicle) => ({ value: String(vehicle.id), label: vehicle.plate_number }))}
                value={vehicleId !== null ? String(vehicleId) : null}
                onValueChange={(value) => setVehicleId(value !== null ? Number(value) : null)}
              >
                <SelectTrigger id="vehicleId" aria-invalid={Boolean(fieldErrors.vehicleId)}>
                  <SelectValue placeholder="Selecciona un vehículo" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={String(vehicle.id)}>
                      {vehicle.plate_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.vehicleId && (
                <p className="text-xs text-destructive" role="alert">
                  {fieldErrors.vehicleId}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="transportPersonnelId">Conductor</Label>
              <Select
                items={personnel.map((driver) => ({
                  value: String(driver.id),
                  label: `${driver.person?.full_name ?? 'Conductor #' + driver.id}${driver.license_number ? ` · ${driver.license_number}` : ''}`,
                }))}
                value={transportPersonnelId !== null ? String(transportPersonnelId) : null}
                onValueChange={(value) => setTransportPersonnelId(value !== null ? Number(value) : null)}
              >
                <SelectTrigger id="transportPersonnelId" aria-invalid={Boolean(fieldErrors.transportPersonnelId)}>
                  <SelectValue placeholder="Selecciona un conductor" />
                </SelectTrigger>
                <SelectContent>
                  {personnel.map((driver) => (
                    <SelectItem key={driver.id} value={String(driver.id)}>
                      {driver.person?.full_name ?? `Conductor #${driver.id}`}
                      {driver.license_number ? ` · ${driver.license_number}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {personnel.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Esta organización no tiene conductores activos registrados todavía.
                </p>
              )}
              {fieldErrors.transportPersonnelId && (
                <p className="text-xs text-destructive" role="alert">
                  {fieldErrors.transportPersonnelId}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="destinationBranchId">Sede de Destino</Label>
              <Select
                items={branches.map((branch) => ({ value: String(branch.id), label: branch.name }))}
                value={destinationBranchId !== null ? String(destinationBranchId) : null}
                onValueChange={(value) => setDestinationBranchId(value !== null ? Number(value) : null)}
              >
                <SelectTrigger id="destinationBranchId" aria-invalid={Boolean(fieldErrors.destinationBranchId)}>
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
              {fieldErrors.destinationBranchId && (
                <p className="text-xs text-destructive" role="alert">
                  {fieldErrors.destinationBranchId}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scheduledPickupAt">Fecha y Hora Programada de Recolección</Label>
              <Input
                id="scheduledPickupAt"
                type="datetime-local"
                value={scheduledPickupAt}
                onChange={(event) => setScheduledPickupAt(event.target.value)}
                aria-invalid={Boolean(fieldErrors.scheduledPickupAt)}
              />
              {fieldErrors.scheduledPickupAt && (
                <p className="text-xs text-destructive" role="alert">
                  {fieldErrors.scheduledPickupAt}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="priority">Prioridad</Label>
              <Select items={PRIORITY_OPTIONS} value={priority} onValueChange={(value) => value && setPriority(value as string)}>
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="requiresSpecialHandling"
              checked={requiresSpecialHandling}
              onCheckedChange={(checked) => setRequiresSpecialHandling(checked === true)}
            />
            <Label htmlFor="requiresSpecialHandling" className="font-normal">
              Requiere manejo especial
            </Label>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="observations">
              Observaciones <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Input id="observations" value={observations} onChange={(event) => setObservations(event.target.value)} />
          </div>

          {catalogsError && (
            <p className="text-sm text-destructive" role="alert" aria-live="polite">
              No se pudo cargar el catálogo de vehículos/conductores/sedes: {catalogsError}
            </p>
          )}

          {formError && (
            <p className="text-sm text-destructive" role="alert" aria-live="polite">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push('/admin/transport-schedules')}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creando…' : 'Crear Programación'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
