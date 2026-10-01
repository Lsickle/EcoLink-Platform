import { useCallback, useEffect, useState } from 'react'
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
  type AdminServiceRequestItem,
  type AdminServiceRequestItemReduced,
  type AdminTransportPersonnel,
  type AdminVehicle,
} from 'app/features/admin/api'
import { createTransportScheduleSchema } from 'app/features/admin/schemas'

export interface ScheduledCalendarEvent {
  id: string
  title: string
  start: string
  allDay: boolean
  extendedProps: {
    request_code: string
    generator_organization_name: string
    driver_name: string
    assistant_name: string
    vehicle_label: string
  }
}

export interface PendingDropInfo {
  request: AdminServiceRequest
  start: string
  allDay: boolean
  /** `true` mientras se resuelve `fetchServiceRequest(request.id)` para obtener sus ítems. */
  isLoadingItems: boolean
  /** Ítems con `item_status.code === 'ACCEPTED'` -- mismo criterio de elegibilidad que `CreateTransportScheduleForm.tsx`. */
  eligibleItems: AdminServiceRequestItem[]
  /** `selectedRequestDetail.branch.id` -- exigido por el backend como `source_branch_id`. */
  sourceBranchId: number | null
  /** Mensaje a mostrar en el diálogo si no hay ítems elegibles, o si la resolución de detalle falló. */
  itemsError: string | null
}

export interface ScheduleAssignmentSelection {
  driverId: number
  /** Auxiliar -- opcional (columna `assistant_personnel_id`, nullable en el backend). */
  assistantId: number | null
  vehicleId: number
  destinationBranchId: number
}

/** Mismo type guard que `CreateTransportScheduleForm.tsx` (`isFullServiceRequestItem`) -- un
 * Gestor sin relación con un ítem lo ve REDUCIDO (`AdminServiceRequestItemReduced`, sin
 * `waste_id`/`item_status`), nunca se debe tratar como elegible. */
function isFullServiceRequestItem(
  item: AdminServiceRequestItem | AdminServiceRequestItemReduced
): item is AdminServiceRequestItem {
  return 'waste_id' in item
}

const NO_ELIGIBLE_ITEMS_MESSAGE =
  'Esta solicitud no tiene ítems Aceptados pendientes de programar para su organización.'

function errorMessage(error: unknown): string {
  if (error instanceof ApiValidationError) {
    return error.firstError('items') ?? error.message
  }
  return error instanceof Error ? error.message : 'Error inesperado.'
}

/** Orden requerido por la pantalla: solicitudes pendientes ordenadas por fecha de solicitud. */
export function sortByRequestedAtAscending(requests: AdminServiceRequest[]): AdminServiceRequest[] {
  return [...requests].sort((a, b) => new Date(a.requested_at).getTime() - new Date(b.requested_at).getTime())
}

/**
 * Estado y transiciones del flujo "arrastrar solicitud -> soltar en el
 * calendario -> confirmar conductor/auxiliar/vehículo/sede de destino en un
 * modal -> se crea una `transport_schedule` real (`POST
 * /admin/transport-schedules`, mismo endpoint y contrato que
 * `CreateTransportScheduleForm.tsx`) y aparece como evento programado" --
 * separado de FullCalendar en sí para que se pueda probar con Testing
 * Library sin depender de renderizar la librería de calendario completa en
 * jsdom.
 *
 * A diferencia del formulario manual, aquí el operador NO elige ítems ni
 * cantidades: se auto-seleccionan TODOS los ítems elegibles
 * (`item_status.code === 'ACCEPTED'`) a su `estimated_quantity` completa
 * (decisión confirmada explícitamente por el usuario, no una simplificación
 * unilateral).
 */
export function useTransportScheduleCalendarState({
  effectiveOrganizationId,
  isPlatformStaff,
}: {
  effectiveOrganizationId: number | null
  isPlatformStaff: boolean
}) {
  const [pendingRequests, setPendingRequests] = useState<AdminServiceRequest[]>([])
  const [scheduledEvents, setScheduledEvents] = useState<ScheduledCalendarEvent[]>([])
  const [pendingDrop, setPendingDrop] = useState<PendingDropInfo | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const [vehicles, setVehicles] = useState<AdminVehicle[]>([])
  const [personnel, setPersonnel] = useState<AdminTransportPersonnel[]>([])
  const [branches, setBranches] = useState<AdminBranch[]>([])
  const [catalogsError, setCatalogsError] = useState<string | null>(null)

  const [isCreating, setIsCreating] = useState(false)
  const [creationError, setCreationError] = useState<string | null>(null)

  // Mismo criterio EXACTO que `CreateTransportScheduleForm.tsx` (líneas
  // 128-150/158-175): sin organización actora resuelta, no se intenta
  // cargar nada (ni pendientes ni catálogos).
  useEffect(() => {
    if (effectiveOrganizationId == null) {
      setPendingRequests([])
      setVehicles([])
      setPersonnel([])
      setBranches([])
      return
    }
    let cancelled = false

    // Sin filtro `status` a propósito -- ver mismo AVISO de
    // `CreateTransportScheduleForm.tsx`: la elegibilidad real es por ítem,
    // nunca por el estado de cabecera.
    fetchServiceRequests({
      perPage: 50,
      organizationId: isPlatformStaff ? effectiveOrganizationId : undefined,
    })
      .then((result) => {
        if (cancelled) return
        setPendingRequests(sortByRequestedAtAscending(result.data))
      })
      .catch(() => {
        if (cancelled) return
        setPendingRequests([])
      })

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
  }, [effectiveOrganizationId, isPlatformStaff])

  const beginDrop = useCallback(
    (requestId: number, start: string, allDay: boolean) => {
      const request = pendingRequests.find((item) => item.id === requestId)
      if (!request) return

      setCreationError(null)
      setPendingDrop({
        request,
        start,
        allDay,
        isLoadingItems: true,
        eligibleItems: [],
        sourceBranchId: null,
        itemsError: null,
      })
      setIsDialogOpen(true)

      fetchServiceRequest(requestId)
        .then((result) => {
          const detail = result.service_request
          const eligibleItems = (detail.items ?? []).filter(
            (item): item is AdminServiceRequestItem => isFullServiceRequestItem(item) && item.item_status?.code === 'ACCEPTED'
          )
          setPendingDrop((current) =>
            current && current.request.id === requestId
              ? {
                  ...current,
                  isLoadingItems: false,
                  eligibleItems,
                  sourceBranchId: detail.branch.id,
                  itemsError: eligibleItems.length === 0 ? NO_ELIGIBLE_ITEMS_MESSAGE : null,
                }
              : current
          )
        })
        .catch((error) => {
          setPendingDrop((current) =>
            current && current.request.id === requestId
              ? {
                  ...current,
                  isLoadingItems: false,
                  itemsError: error instanceof Error ? error.message : 'Error inesperado.',
                }
              : current
          )
        })
    },
    [pendingRequests]
  )

  const cancelAssignment = useCallback(() => {
    setIsDialogOpen(false)
    setPendingDrop(null)
    setCreationError(null)
  }, [])

  const confirmAssignment = useCallback(
    async (selection: ScheduleAssignmentSelection) => {
      if (!pendingDrop || pendingDrop.sourceBranchId == null || pendingDrop.eligibleItems.length === 0) {
        return
      }

      const itemsPayload = pendingDrop.eligibleItems.map((item) => ({
        wasteServiceRequestItemId: item.id,
        scheduledQuantity: Number(item.estimated_quantity ?? 0),
      }))

      const parsed = createTransportScheduleSchema.safeParse({
        organizationId: isPlatformStaff ? (effectiveOrganizationId ?? undefined) : undefined,
        wasteServiceRequestId: pendingDrop.request.id,
        vehicleId: selection.vehicleId,
        transportPersonnelId: selection.driverId,
        sourceBranchId: pendingDrop.sourceBranchId,
        destinationBranchId: selection.destinationBranchId,
        scheduledPickupAt: pendingDrop.start,
        priority: 'MEDIUM',
        requiresSpecialHandling: false,
        items: itemsPayload,
      })

      if (!parsed.success) {
        setCreationError(parsed.error.issues[0]?.message ?? 'Datos inválidos.')
        return
      }

      setCreationError(null)
      setIsCreating(true)
      try {
        const { transport_schedule: created } = await createTransportSchedule({
          organization_id: isPlatformStaff ? (parsed.data.organizationId ?? undefined) : undefined,
          waste_service_request_id: parsed.data.wasteServiceRequestId,
          vehicle_id: parsed.data.vehicleId,
          transport_personnel_id: parsed.data.transportPersonnelId,
          assistant_personnel_id: selection.assistantId,
          source_branch_id: parsed.data.sourceBranchId,
          destination_branch_id: parsed.data.destinationBranchId,
          scheduled_pickup_at: parsed.data.scheduledPickupAt,
          priority: parsed.data.priority || undefined,
          requires_special_handling: parsed.data.requiresSpecialHandling,
          items: parsed.data.items.map((item) => ({
            waste_service_request_item_id: item.wasteServiceRequestItemId,
            scheduled_quantity: item.scheduledQuantity,
          })),
        })

        // El shape real de la respuesta de `createTransportSchedule()` es
        // deliberadamente parcial (ver docblock en `api.ts`, sin
        // placa/nombre de conductor legibles) -- el evento visual se arma
        // con los catálogos YA cargados en este hook (`personnel`/
        // `vehicles`), no con datos mock ni con campos inventados en la
        // respuesta.
        const driver = personnel.find((item) => item.id === selection.driverId)
        const assistant = selection.assistantId != null ? personnel.find((item) => item.id === selection.assistantId) : null
        const vehicle = vehicles.find((item) => item.id === selection.vehicleId)

        setScheduledEvents((current) => [
          ...current,
          {
            id: `transport-schedule-${created.id}`,
            title: `${pendingDrop.request.request_code} · ${pendingDrop.request.organization?.legal_name ?? '—'}`,
            start: pendingDrop.start,
            allDay: pendingDrop.allDay,
            extendedProps: {
              request_code: pendingDrop.request.request_code,
              generator_organization_name: pendingDrop.request.organization?.legal_name ?? '—',
              driver_name: driver?.person?.full_name ?? '—',
              assistant_name: assistant?.person?.full_name ?? '—',
              vehicle_label: vehicle?.plate_number ?? '—',
            },
          },
        ])
        setPendingRequests((current) => current.filter((item) => item.id !== pendingDrop.request.id))
        setIsDialogOpen(false)
        setPendingDrop(null)
      } catch (error) {
        setCreationError(errorMessage(error))
      } finally {
        setIsCreating(false)
      }
    },
    [pendingDrop, isPlatformStaff, effectiveOrganizationId, personnel, vehicles]
  )

  return {
    pendingRequests,
    scheduledEvents,
    pendingDrop,
    isDialogOpen,
    vehicles,
    personnel,
    branches,
    catalogsError,
    isCreating,
    creationError,
    beginDrop,
    cancelAssignment,
    confirmAssignment,
  }
}
