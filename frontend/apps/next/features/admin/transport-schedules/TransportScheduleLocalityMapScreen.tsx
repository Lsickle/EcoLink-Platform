'use client'

import dynamic from 'next/dynamic'
import { useRequireAuth } from 'app/provider/auth'
import { EcoLinkSpinner } from '@/components/ecolink-spinner'

const TransportScheduleLocalityMapWorkspace = dynamic(
  () =>
    import('./TransportScheduleLocalityMapWorkspace').then((mod) => mod.TransportScheduleLocalityMapWorkspace),
  {
    ssr: false,
    loading: () => <EcoLinkSpinner label="Cargando mapa de programación…" />,
  }
)

/**
 * "Programación por Localidad" -- mapa clickeable de las 20 localidades de
 * Bogotá con selector de fecha y panel de programaciones. Gateada por
 * `transport_schedules.read` (mismo permiso que el listado y que
 * "Calendario de Programación" exige para `.create` -- aquí es solo
 * lectura, ver docblock de `TransportScheduleController::localitySummary()`).
 * Sin CU-XXX/RN-XXX asignado todavía en Notion para esta pantalla
 * específica -- mismo criterio ya documentado en
 * `TransportScheduleCalendarScreen.tsx`.
 */
export function TransportScheduleLocalityMapScreen() {
  const { isAuthorized } = useRequireAuth('transport_schedules.read')

  if (!isAuthorized) {
    return <EcoLinkSpinner />
  }

  return <TransportScheduleLocalityMapWorkspace />
}
