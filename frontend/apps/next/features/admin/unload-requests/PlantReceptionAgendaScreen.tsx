'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  fetchBranches,
  fetchPlantReceptionSchedule,
  fetchUnloadRequests,
  type AdminBranch,
  type AdminPlantReceptionSchedule,
  type AdminUnloadRequest,
} from 'app/features/admin/api'
import { formatDate } from 'app/features/admin/formatDate'
import { useRequireAuth } from 'app/provider/auth'

const APPROVED_REQUESTS_PAGE_SIZE = 50

type AgendaEntry = {
  unloadRequest: AdminUnloadRequest
  schedule: AdminPlantReceptionSchedule | null
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true }).format(date)
}

/**
 * "Agenda de Recepciones en Planta" (Fase 4 "Cita de Recepción en Planta
 * (bilateral)", Figma node 991:14128) -- LISTA AGRUPADA POR DÍA, no el
 * calendario semanal pixel-perfect del frame (bloques por muelle
 * posicionados en una grilla de horas, navegación "Semana anterior/
 * siguiente", panel "Capacidad Hoy").
 *
 * SIMPLIFICACIÓN EXPLÍCITA, decisión de este agente (no del usuario) por una
 * razón MÁS PROFUNDA que "tiempo disponible": el backend real de este lote
 * NO EXPONE ningún endpoint para listar `plant_reception_schedules` por sede
 * receptora + rango de fechas -- `PlantReceptionScheduleController` solo
 * tiene `show()`/`propose()`/`counterPropose()`/`confirm()`/`reschedule()`,
 * TODOS escopados a una `unload_request` puntual (ver docblock del
 * controller/rutas en `routes/api.php`); `UnloadRequestController::index()`
 * tampoco acepta un filtro `receiving_branch_id` (solo `search`/`status`).
 * Sin esos 2 filtros no es posible construir server-side "todas las citas de
 * la Planta X esta semana" -- se resuelve aquí con un enfoque N+1 acotado
 * (fetch de solicitudes Aprobadas + 1 `fetchPlantReceptionSchedule()` por
 * cada una, filtradas client-side por sede) que solo escala mientras el
 * volumen de solicitudes Aprobadas sea pequeño. FLAG explícito para el hilo
 * principal: si este volumen crece, el backend necesita un endpoint dedicado
 * (ej. `GET /api/admin/plant-reception-schedules?receiving_branch_id=&date_from=&date_to=`)
 * antes de que esta pantalla escale a producción real.
 *
 * Por el mismo motivo se omite el medidor "Capacidad Hoy" del frame --
 * `branch_locations` (muelles) NO tiene columna de capacidad en este lote
 * (ver docblock de la migración `create_branch_locations_table`: acotada a
 * un subconjunto mínimo, capacidad/canvas quedan diferidos a la feature
 * futura de áreas de almacenamiento).
 */
export function PlantReceptionAgendaScreen() {
  const router = useRouter()
  const { isAuthorized } = useRequireAuth('plant_reception_schedules.read')

  const [branches, setBranches] = useState<AdminBranch[]>([])
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null)

  const [entries, setEntries] = useState<AgendaEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

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
    fetchUnloadRequests({ perPage: APPROVED_REQUESTS_PAGE_SIZE, status: 'APPROVED' })
      .then(async (result) => {
        const branchRequests = result.data.filter((request) => request.receiving_branch_id === selectedBranchId)
        const withSchedules = await Promise.all(
          branchRequests.map(async (unloadRequest) => {
            try {
              const { plant_reception_schedule } = await fetchPlantReceptionSchedule(unloadRequest.id)
              return { unloadRequest, schedule: plant_reception_schedule }
            } catch {
              return { unloadRequest, schedule: null }
            }
          })
        )
        if (cancelled) return
        setEntries(withSchedules)
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
  }, [isAuthorized, selectedBranchId])

  if (!isAuthorized) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  const scheduled = entries
    .filter((entry) => entry.schedule !== null)
    .sort((a, b) => (a.schedule!.scheduled_date < b.schedule!.scheduled_date ? -1 : 1))
  const unscheduled = entries.filter((entry) => entry.schedule === null)

  const groupedByDate = new Map<string, AgendaEntry[]>()
  for (const entry of scheduled) {
    const key = entry.schedule!.scheduled_date
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

      {loadError && (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground" role="status">
          Cargando…
        </p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay solicitudes Aprobadas pendientes de recepción en esta planta.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {Array.from(groupedByDate.entries()).map(([date, group]: [string, AgendaEntry[]]) => (
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
                      <Badge variant="outline">{formatTime(schedule!.scheduled_start_at)}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {unloadRequest.carrier_organization?.legal_name ?? '—'} · Muelle: {schedule!.dock_location?.name ?? '—'}
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
                {unscheduled.map(({ unloadRequest }) => (
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
