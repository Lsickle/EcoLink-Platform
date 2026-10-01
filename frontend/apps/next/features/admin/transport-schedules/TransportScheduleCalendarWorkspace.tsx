'use client'

import { useEffect, useRef, useState } from 'react'
import { EventCalendar } from '@/components/event-calendar'
import { Draggable } from '@fullcalendar/react/interaction'
import type { EventReceiveInfo } from '@fullcalendar/react'
import { useAuth } from 'app/provider/auth'
import { OrganizationSearchSelect } from '../OrganizationSearchSelect'
import { PendingRequestsPanel } from './PendingRequestsPanel'
import { ScheduleAssignmentDialog } from './ScheduleAssignmentDialog'
import { useTransportScheduleCalendarState } from './useTransportScheduleCalendarState'

// Vistas pedidas explícitamente: Mes, Semana, Día, Lista, Año. `multiMonthYear`
// (plugin `multimonth`, ya incluido por el componente `EventCalendar`
// instalado vía shadcn) es la única forma real de tener una vista de "Año".
const AVAILABLE_VIEWS = ['dayGridMonth', 'timeGridWeek', 'timeGridDay', 'listWeek', 'multiMonthYear']

/**
 * Pieza que realmente monta FullCalendar -- cargada SIEMPRE vía
 * `dynamic(..., { ssr: false })` desde `TransportScheduleCalendarScreen`
 * (App Router + librería que manipula el DOM directamente).
 *
 * Ya conectada a datos y persistencia reales (`useTransportScheduleCalendarState`):
 * al soltar una solicitud pendiente y confirmar conductor/auxiliar/vehículo/
 * sede de destino, se crea una `transport_schedule` real vía
 * `POST /admin/transport-schedules` (mismo endpoint que
 * `CreateTransportScheduleForm.tsx`).
 *
 * Resolución de organización actora: mismo patrón EXACTO que
 * `CreateTransportScheduleForm.tsx` -- un platform staff elige la
 * organización que programa con `OrganizationSearchSelect`
 * (`capability="can_transport_waste"`); cualquier otro actor usa
 * `user.tenant_organization_id` directamente, sin selector visible.
 *
 * Nota de API, verificada leyendo los `.d.ts` instalados (no asumida): el
 * componente `EventCalendar` que trajo el registry de shadcn
 * (`@fullcalendar/forma-event-calendar`, variante "shadcn" del theme Forma)
 * ya trae su propio toolbar (`EventCalendarToolbar`) con un slot
 * `addButton` de primera clase -- su tipo (`EventCalendarProps`) OMITE
 * `headerToolbar`/`footerToolbar` a propósito. El botón "Agregar Evento" que
 * existía en el prototipo (shell de UI) se RETIRÓ al conectar datos reales:
 * sin una Solicitud de Servicio de origen no hay `waste_service_request_id`
 * ni ítems que programar, así que no hay ninguna programación válida que
 * ese botón pudiera crear -- `EventCalendarToolbar` tampoco expone una
 * variante deshabilitada del botón, así que la alternativa era dejar un
 * flujo que abre un diálogo que nunca puede confirmar. Decisión explícita,
 * no un olvido -- ver resumen de la tarea.
 */
export function TransportScheduleCalendarWorkspace() {
  const draggableContainerRef = useRef<HTMLDivElement>(null)
  // Ancla del portal del modal (ver `ScheduleAssignmentDialog`) -- así el
  // diálogo hereda el override de `--primary`/`--ring`/etc. escopeado a
  // `.transport-schedule-calendar` en vez de escapar al `document.body`.
  const workspaceRootRef = useRef<HTMLDivElement>(null)

  const { user } = useAuth()
  const isPlatformStaff = Boolean(user?.is_platform_staff)
  const [organizationId, setOrganizationId] = useState<number | null>(null)
  const [organizationLabel, setOrganizationLabel] = useState<string | null>(null)
  const effectiveOrganizationId = isPlatformStaff ? organizationId : (user?.tenant_organization_id ?? null)

  const {
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
  } = useTransportScheduleCalendarState({ effectiveOrganizationId, isPlatformStaff })

  useEffect(() => {
    const container = draggableContainerRef.current
    if (!container) return
    const draggable = new Draggable(container, {
      itemSelector: '.pending-request-card',
      eventData: (el) => JSON.parse(el.dataset.event ?? '{}'),
    })
    return () => draggable.destroy()
  }, [])

  function handleEventReceive(info: EventReceiveInfo) {
    const requestId = Number(info.event.extendedProps.requestId)
    const start = info.event.startStr
    const allDay = info.event.allDay
    // El evento "fantasma" que FullCalendar crea automáticamente al soltar
    // se revierte de inmediato -- la programación real solo entra al
    // estado (controlado por React) cuando se confirma el modal de
    // conductor/auxiliar/vehículo/sede de destino y el backend responde OK.
    info.revert()
    if (!Number.isFinite(requestId)) return
    beginDrop(requestId, start, allDay)
  }

  return (
    <div ref={workspaceRootRef} className="transport-schedule-calendar flex flex-col gap-4">
      {isPlatformStaff && (
        <OrganizationSearchSelect
          label="Organización que programa"
          htmlId="transportScheduleCalendarOrganizationId"
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

      {catalogsError && (
        <p className="text-sm text-destructive" role="alert" aria-live="polite">
          No se pudo cargar el catálogo de vehículos/conductores/sedes: {catalogsError}
        </p>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <PendingRequestsPanel requests={pendingRequests} panelRef={draggableContainerRef} />

        <div className="min-w-0 flex-1">
          <EventCalendar
            height="auto"
            editable
            selectable
            droppable
            nowIndicator
            availableViews={AVAILABLE_VIEWS}
            // "+N más" nativo de FullCalendar en vez de lógica de overflow a mano.
            dayMaxEvents={3}
            eventMaxStack={2}
            events={scheduledEvents}
            eventReceive={handleEventReceive}
          />
        </div>

        <ScheduleAssignmentDialog
          open={isDialogOpen}
          pendingDrop={pendingDrop}
          drivers={personnel}
          assistants={personnel}
          vehicles={vehicles}
          branches={branches}
          isSubmitting={isCreating}
          submitError={creationError}
          onConfirm={confirmAssignment}
          onCancel={cancelAssignment}
          portalContainer={workspaceRootRef}
        />
      </div>
    </div>
  )
}
