import type { Ref } from 'react'
import { GripVertical } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AdminServiceRequest } from 'app/features/admin/api'

const REQUESTED_AT_FORMATTER = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

export interface PendingRequestsPanelProps {
  requests: AdminServiceRequest[]
  /** Contenedor sobre el que `@fullcalendar/react/interaction`'s `Draggable` se ancla (`itemSelector: '.pending-request-card'`). */
  panelRef?: Ref<HTMLDivElement>
}

/**
 * Panel lateral izquierdo de "Solicitudes de Servicio" pendientes de
 * programar -- mini-cards con datos REALES (`fetchServiceRequests()`,
 * cargados y ordenados por `requested_at` desde
 * `useTransportScheduleCalendarState`). Cada card es un origen de
 * drag-and-drop externo hacia el calendario (marcado vía
 * `.pending-request-card` + `data-event`, leído por `Draggable` en
 * `TransportScheduleCalendarWorkspace`).
 *
 * `AdminServiceRequest` NO tiene un campo `waste_type` a nivel de cabecera
 * (ese dato vive por ítem, `waste_name_snapshot`) -- se muestra en su lugar
 * la Sede de origen (`branch.name`), disponible en la fila de `index()`.
 */
export function PendingRequestsPanel({ requests, panelRef }: PendingRequestsPanelProps) {
  return (
    <Card className="w-full shrink-0 lg:w-72">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Solicitudes de Servicio</CardTitle>
        <Badge variant="secondary">{requests.length}</Badge>
      </CardHeader>
      <CardContent>
        {/* Contenedor propio (en vez de pasar `panelRef` directo a
            `CardContent`) para no depender de que el primitivo shadcn
            reenvíe `ref` -- así el ancla de `Draggable` es un <div> plano
            bajo nuestro control directo. */}
        <div ref={panelRef} className="flex flex-col gap-2">
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay solicitudes pendientes de programar.</p>
          ) : (
            requests.map((request) => (
              <div
                key={request.id}
                className="pending-request-card flex cursor-grab items-start gap-2 rounded-lg border border-l-4 border-l-primary bg-background p-3 shadow-xs transition-colors hover:bg-muted/50 active:cursor-grabbing"
                data-request-id={request.id}
                data-event={JSON.stringify({
                  requestId: request.id,
                  title: `${request.request_code} · ${request.organization?.legal_name ?? '—'}`,
                })}
              >
                <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="text-sm font-medium">{request.request_code}</p>
                  <p className="truncate text-xs text-muted-foreground">{request.organization?.legal_name ?? '—'}</p>
                  <p className="truncate text-xs text-muted-foreground">{request.branch?.name ?? '—'}</p>
                  <p className="text-xs text-primary">
                    Solicitado: {REQUESTED_AT_FORMATTER.format(new Date(request.requested_at))}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
