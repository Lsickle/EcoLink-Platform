'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  fetchBranches,
  fetchPlantReceptionSchedules,
  fetchUnloadRequests,
  type AdminBranch,
  type AdminPlantReceptionScheduleAgendaRow,
  type AdminUnloadRequest,
} from 'app/features/admin/api'
import { formatDate } from 'app/features/admin/formatDate'
import { useRequireAuth } from 'app/provider/auth'

const APPROVED_REQUESTS_PAGE_SIZE = 50
const SCHEDULES_PAGE_SIZE = 100

type ScheduledEntry = {
  unloadRequest: AdminUnloadRequest
  schedule: AdminPlantReceptionScheduleAgendaRow
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true }).format(date)
}

// Componentes LOCALES del calendario (no UTC) -- a diferencia de
// `formatDate()` (que fuerza `timeZone: 'UTC'` para mostrar timestamps del
// backend), aquí necesitamos el día calendario tal como lo vive el usuario
// en su propio navegador, para que "la semana visible" sea realmente la
// semana en la que está parado hoy.
function toDateOnly(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Lunes de la semana que contiene `date` (semana ISO, lunes-domingo -- mismo
// criterio de arranque de semana que el resto de convenciones de Colombia).
function startOfWeek(date: Date): Date {
  const result = new Date(date)
  const day = result.getDay() // 0=domingo .. 6=sábado
  const diffToMonday = (day + 6) % 7
  result.setDate(result.getDate() - diffToMonday)
  result.setHours(0, 0, 0, 0)
  return result
}

/**
 * "Agenda de Recepciones en Planta" (Fase 4 "Cita de Recepción en Planta
 * (bilateral)", Figma node 991:14128) -- LISTA AGRUPADA POR DÍA, no el
 * calendario semanal pixel-perfect del frame (bloques por muelle
 * posicionados en una grilla de horas, navegación "Semana anterior/
 * siguiente" con controles interactivos, panel "Capacidad Hoy"). Se muestra
 * la semana actual (lunes-domingo) sin controles de navegación todavía --
 * fuera de alcance de este cierre de gap (que se limitó a reemplazar el
 * workaround N+1 de abajo), señalado explícitamente al hilo principal.
 *
 * GAP N+1 YA CERRADO (2026-07-20): hasta esta fecha, el backend NO exponía
 * ningún endpoint para listar `plant_reception_schedules` por sede receptora
 * + rango de fechas -- se resolvía con 1 fetch de `fetchUnloadRequests()` +
 * 1 `fetchPlantReceptionSchedule()` POR CADA solicitud Aprobada (N+1 acotado
 * que solo escalaba mientras el volumen de solicitudes Aprobadas fuera
 * pequeño). Ahora usa `GET /api/admin/plant-reception-schedules?
 * receiving_branch_id=&date_from=&date_to=` (`PlantReceptionScheduleController::
 * index()`, aislamiento anti-IDOR ya revisado por seguridad) -- 2 fetches
 * totales por cambio de sede/semana (aprobadas de la sede + franjas de la
 * semana), sin importar cuántas solicitudes existan.
 *
 * LIMITACIÓN CONOCIDA, declarada explícitamente (no resuelta en silencio):
 * la franja de una solicitud puede existir FUERA de la semana visible (p.
 * ej. programada para la semana siguiente) -- como el fetch de franjas está
 * acotado a `date_from`/`date_to` de la semana actual, esa solicitud
 * aparecerá en "Sin Programar" aunque en realidad SÍ tiene una franja, solo
 * que en otra semana. Corregirlo del todo requeriría un segundo fetch sin
 * acotar fechas (o navegación de semana + refetch), evaluado como fuera de
 * alcance de este cierre puntual -- flag explícito para el hilo principal.
 *
 * Por el mismo motivo que antes se omite el medidor "Capacidad Hoy" del
 * frame -- `branch_locations` (muelles) NO tiene columna de capacidad en
 * este lote (ver docblock de la migración `create_branch_locations_table`:
 * acotada a un subconjunto mínimo, capacidad/canvas quedan diferidos a la
 * feature futura de áreas de almacenamiento).
 */
export function PlantReceptionAgendaScreen() {
  const router = useRouter()
  const { isAuthorized } = useRequireAuth('plant_reception_schedules.read')

  const [branches, setBranches] = useState<AdminBranch[]>([])
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null)

  const [approvedRequests, setApprovedRequests] = useState<AdminUnloadRequest[]>([])
  const [schedules, setSchedules] = useState<AdminPlantReceptionScheduleAgendaRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const weekStart = useMemo(() => startOfWeek(new Date()), [])
  const weekEnd = useMemo(() => {
    const end = new Date(weekStart)
    end.setDate(end.getDate() + 6)
    return end
  }, [weekStart])

  useEffect(() => {
    if (!isAuthorized) return
    fetchBranches({ perPage: 100 })
      .then((result) => {
        setBranches(result.data)
        setSelectedBranchId((current) => current ?? result.data[0]?.id ?? null)
      })
      .catch(() => setBranches([]))
  }, [isAuthorized])

  useEffect(() => {
    if (!isAuthorized || selectedBranchId === null) return
    let cancelled = false
    setIsLoading(true)
    Promise.all([
      fetchUnloadRequests({ receivingBranchId: selectedBranchId, status: 'APPROVED', perPage: APPROVED_REQUESTS_PAGE_SIZE }),
      fetchPlantReceptionSchedules({
        receivingBranchId: selectedBranchId,
        dateFrom: toDateOnly(weekStart),
        dateTo: toDateOnly(weekEnd),
        perPage: SCHEDULES_PAGE_SIZE,
      }),
    ])
      .then(([requestsResult, schedulesResult]) => {
        if (cancelled) return
        setApprovedRequests(requestsResult.data)
        // Solo la versión VIGENTE de cada franja -- una reprogramación deja
        // la versión anterior con `is_active=false` (SUPERSEDED) y crea una
        // fila nueva, mismo criterio que `UnloadRequest::activeReceptionSchedule()`.
        setSchedules(schedulesResult.data.filter((schedule) => schedule.is_active))
        setLoadError(null)
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
  }, [isAuthorized, selectedBranchId, weekStart, weekEnd])

  if (!isAuthorized) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  const schedulesByRequestId = new Map(schedules.map((schedule) => [schedule.unload_request_id, schedule]))

  const scheduled: ScheduledEntry[] = approvedRequests
    .filter((request) => schedulesByRequestId.has(request.id))
    .map((request) => ({ unloadRequest: request, schedule: schedulesByRequestId.get(request.id)! }))
    .sort((a, b) => (a.schedule.scheduled_date < b.schedule.scheduled_date ? -1 : 1))
  const unscheduled = approvedRequests.filter((request) => !schedulesByRequestId.has(request.id))

  const groupedByDate = new Map<string, ScheduledEntry[]>()
  for (const entry of scheduled) {
    const key = entry.schedule.scheduled_date
    const group = groupedByDate.get(key) ?? []
    group.push(entry)
    groupedByDate.set(key, group)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="sm:w-72">
          <Select
            items={branches.map((branch) => ({ value: String(branch.id), label: branch.name }))}
            value={selectedBranchId !== null ? String(selectedBranchId) : undefined}
            onValueChange={(value) => value && setSelectedBranchId(Number(value))}
          >
            <SelectTrigger aria-label="Planta de Recepción" className="w-full">
              <SelectValue placeholder="Selecciona una planta" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={String(branch.id)}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.push('/admin/unload-requests')}>
          Ver Solicitudes de Descargue
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Semana del {formatDate(toDateOnly(weekStart))} al {formatDate(toDateOnly(weekEnd))}
      </p>

      {loadError && (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground" role="status">
          Cargando…
        </p>
      ) : approvedRequests.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay solicitudes Aprobadas pendientes de recepción en esta planta.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {Array.from(groupedByDate.entries()).map(([date, group]: [string, ScheduledEntry[]]) => (
            <Card key={date}>
              <CardHeader>
                <CardTitle className="text-base">{formatDate(date)}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {group.map(({ unloadRequest, schedule }) => (
                  <button
                    key={unloadRequest.id}
                    type="button"
                    className="flex flex-col gap-1 rounded-lg border border-border p-3 text-left hover:bg-muted"
                    onClick={() => router.push(`/admin/unload-requests/${unloadRequest.id}`)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{unloadRequest.request_number}</span>
                      <Badge variant="outline">{formatTime(schedule.scheduled_start_at)}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {unloadRequest.carrier_organization?.legal_name ?? '—'} · Muelle: {schedule.dock_location?.name ?? '—'}
                    </span>
                  </button>
                ))}
              </CardContent>
            </Card>
          ))}

          {unscheduled.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sin Programar</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {unscheduled.map((unloadRequest) => (
                  <button
                    key={unloadRequest.id}
                    type="button"
                    className="flex flex-col gap-1 rounded-lg border border-border p-3 text-left hover:bg-muted"
                    onClick={() => router.push(`/admin/unload-requests/${unloadRequest.id}`)}
                  >
                    <span className="text-sm font-semibold">{unloadRequest.request_number}</span>
                    <span className="text-xs text-muted-foreground">
                      {unloadRequest.carrier_organization?.legal_name ?? '—'} · Aprobada, sin franja propuesta
                    </span>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
