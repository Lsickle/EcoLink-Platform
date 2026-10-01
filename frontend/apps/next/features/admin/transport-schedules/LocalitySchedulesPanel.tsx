import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AdminTransportSchedule } from 'app/features/admin/api'
import { EcoLinkSpinner } from '@/components/ecolink-spinner'

const PICKUP_TIME_FORMATTER = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

// Mismo criterio de color que `TransportSchedulesListScreen.tsx` -- `CANC`/
// `FIN` (riesgo ya documentado en el plan) se muestran con badge, nunca se
// ocultan de la lista.
const STATUS_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  BOR: 'secondary',
  PEND: 'outline',
  PROG: 'outline',
  CONF: 'default',
  EJEC: 'default',
  FIN: 'default',
  CANC: 'destructive',
}

function statusBadgeVariant(code: string | undefined): 'default' | 'secondary' | 'destructive' | 'outline' {
  return (code && STATUS_BADGE_VARIANT[code]) || 'outline'
}

export interface LocalitySchedulesPanelProps {
  schedules: AdminTransportSchedule[]
  isLoading: boolean
  /** `null` = ninguna localidad elegida todavía en el mapa (primer estado vacío, distinto de "elegida mas sin datos"). */
  selectedLocalityName: string | null
  onSelectSchedule: (scheduleId: number) => void
}

/**
 * Panel lateral derecho de la vista "Programación por Localidad" -- lista
 * de SOLO LECTURA de `transport_schedules` para la fecha+localidad
 * elegidas. A diferencia de `PendingRequestsPanel.tsx` (usado solo como
 * referencia visual de estilo, ver plan), esta lista NO es origen de
 * drag-and-drop: click navega al detalle, no remueve ni reordena items.
 */
export function LocalitySchedulesPanel({
  schedules,
  isLoading,
  selectedLocalityName,
  onSelectSchedule,
}: LocalitySchedulesPanelProps) {
  return (
    <Card className="w-full shrink-0 lg:w-80">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">
          {selectedLocalityName ? `Programaciones — ${selectedLocalityName}` : 'Programaciones'}
        </CardTitle>
        <Badge variant="secondary">{schedules.length}</Badge>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <EcoLinkSpinner label="Cargando programaciones…" />
        ) : selectedLocalityName === null ? (
          <p className="text-sm text-muted-foreground">
            Seleccione una localidad en el mapa para ver sus programaciones.
          </p>
        ) : schedules.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin programaciones para esta fecha y localidad.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {schedules.map((schedule) => (
              <button
                key={schedule.id}
                type="button"
                onClick={() => onSelectSchedule(schedule.id)}
                className="flex flex-col gap-0.5 rounded-lg border p-3 text-left shadow-xs transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{schedule.schedule_number}</span>
                  <Badge variant={statusBadgeVariant(schedule.transport_status?.code)}>
                    {schedule.transport_status?.name ?? '—'}
                  </Badge>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {schedule.waste_service_request?.request_code ?? '—'}
                </p>
                <p className="truncate text-xs text-muted-foreground">{schedule.source_branch?.name ?? '—'}</p>
                <p className="text-xs text-primary">
                  {PICKUP_TIME_FORMATTER.format(new Date(schedule.scheduled_pickup_at))}
                </p>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
