'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  fetchLocalities,
  fetchTransportSchedules,
  fetchTransportScheduleLocalitySummary,
  type AdminLocality,
  type AdminTransportSchedule,
  type AdminTransportScheduleLocalitySummary,
} from 'app/features/admin/api'
import { BogotaLocalityMap } from './BogotaLocalityMap'
import { ScheduleDateNavigator, toLocalDateString } from './ScheduleDateNavigator'
import { LocalitySchedulesPanel } from './LocalitySchedulesPanel'

function startOfToday(): Date {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now
}

/**
 * Orquesta la vista "Programación por Localidad": fecha seleccionada,
 * localidad seleccionada, y los dos fetch del contrato nuevo --
 * `fetchTransportScheduleLocalitySummary()` (recarga al cambiar de fecha,
 * alimenta el relleno del mapa) y `fetchTransportSchedules()` filtrado por
 * `date`+`localityId` (recarga al cambiar de fecha O de localidad, solo
 * cuando hay una localidad elegida -- antes de eso el panel derecho
 * muestra su primer estado vacío, ver `LocalitySchedulesPanel`).
 *
 * NOTA (alcance, no resuelto silenciosamente): a diferencia de
 * `TransportSchedulesListScreen`, esta vista no expone un filtro de
 * Organización para platform staff -- el plan aprobado no lo pidió
 * explícitamente. El contrato de API ya soporta `organization_id` opcional
 * en ambos endpoints si se decide agregarlo después.
 */
export function TransportScheduleLocalityMapWorkspace() {
  const router = useRouter()

  const [selectedDate, setSelectedDate] = useState<Date>(startOfToday)
  const [selectedLocalityId, setSelectedLocalityId] = useState<number | null>(null)
  const [selectedLocalityName, setSelectedLocalityName] = useState<string | null>(null)

  const [localities, setLocalities] = useState<AdminLocality[]>([])

  const [localityCounts, setLocalityCounts] = useState<AdminTransportScheduleLocalitySummary[]>([])
  const [isSummaryLoading, setIsSummaryLoading] = useState(true)
  const [summaryError, setSummaryError] = useState<string | null>(null)

  const [schedules, setSchedules] = useState<AdminTransportSchedule[]>([])
  const [isSchedulesLoading, setIsSchedulesLoading] = useState(false)
  const [schedulesError, setSchedulesError] = useState<string | null>(null)

  // Catálogo de las 20 localidades de Bogotá -- se carga una sola vez, sin
  // depender de la fecha/localidad elegida.
  useEffect(() => {
    let cancelled = false
    fetchLocalities({ perPage: 100 })
      .then((result) => {
        if (!cancelled) setLocalities(result.data)
      })
      .catch(() => {
        // Silencioso a propósito: `BogotaLocalityMap` sigue siendo
        // funcional (pinta el mapa) aunque el catálogo de la BD falle --
        // solo se pierde la resolución de id/nombre por código.
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Resumen de conteo por localidad (alimenta el relleno del mapa) --
  // recarga al cambiar de fecha.
  useEffect(() => {
    let cancelled = false
    setIsSummaryLoading(true)
    fetchTransportScheduleLocalitySummary({ date: toLocalDateString(selectedDate) })
      .then((result) => {
        if (cancelled) return
        setLocalityCounts(result.data)
        setSummaryError(null)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setSummaryError(error instanceof Error ? error.message : 'No se pudo cargar el resumen por localidad.')
      })
      .finally(() => {
        if (!cancelled) setIsSummaryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedDate])

  // Programaciones de la localidad+fecha elegidas -- solo dispara con una
  // localidad seleccionada.
  useEffect(() => {
    if (selectedLocalityId === null) {
      setSchedules([])
      setSchedulesError(null)
      return
    }
    let cancelled = false
    setIsSchedulesLoading(true)
    fetchTransportSchedules({
      date: toLocalDateString(selectedDate),
      localityId: selectedLocalityId,
      perPage: 50,
    })
      .then((result) => {
        if (cancelled) return
        setSchedules(result.data)
        setSchedulesError(null)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setSchedulesError(error instanceof Error ? error.message : 'No se pudo cargar las programaciones.')
      })
      .finally(() => {
        if (!cancelled) setIsSchedulesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedDate, selectedLocalityId])

  const handleSelectLocality = useCallback((localityId: number, localityName: string) => {
    setSelectedLocalityId(localityId)
    setSelectedLocalityName(localityName)
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <ScheduleDateNavigator date={selectedDate} onDateChange={setSelectedDate} />

      {summaryError && (
        <p className="text-sm text-destructive" role="alert">
          {summaryError}
        </p>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <BogotaLocalityMap
            localities={localities}
            localityCounts={localityCounts}
            selectedLocalityId={selectedLocalityId}
            onSelectLocality={handleSelectLocality}
          />
          {isSummaryLoading && <p className="mt-2 text-xs text-muted-foreground">Actualizando resumen…</p>}
        </div>

        <div className="flex flex-col gap-2">
          {schedulesError && (
            <p className="text-sm text-destructive" role="alert">
              {schedulesError}
            </p>
          )}
          <LocalitySchedulesPanel
            schedules={schedules}
            isLoading={isSchedulesLoading}
            selectedLocalityName={selectedLocalityName}
            onSelectSchedule={(scheduleId) => router.push(`/admin/transport-schedules/${scheduleId}`)}
          />
        </div>
      </div>
    </div>
  )
}
