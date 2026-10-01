'use client'

import dynamic from 'next/dynamic'
import { useRequireAuth } from 'app/provider/auth'
import { EcoLinkSpinner } from '@/components/ecolink-spinner'

const TransportScheduleCalendarWorkspace = dynamic(
  () => import('./TransportScheduleCalendarWorkspace').then((mod) => mod.TransportScheduleCalendarWorkspace),
  {
    ssr: false,
    loading: () => (
      <EcoLinkSpinner label='Cargando calendario…' />
    ),
  }
)

/**
 * "Interfaz de programación de servicios": el operador arrastra una
 * Solicitud de Servicio pendiente hacia un calendario y, al confirmar
 * conductor/auxiliar (opcional)/vehículo/sede de destino, se crea una
 * `transport_schedule` REAL vía `POST /admin/transport-schedules` -- mismo
 * endpoint y contrato que usa la vía manual (`CreateTransportScheduleForm.tsx`).
 * Ya no es un shell de UI con datos de ejemplo -- ver
 * `TransportScheduleCalendarWorkspace.tsx` y
 * `useTransportScheduleCalendarState.ts` para el wiring real a la API.
 *
 * A diferencia del formulario manual, aquí el operador NO elige ítems ni
 * cantidades: se auto-seleccionan TODOS los ítems elegibles
 * (`item_status.code === 'ACCEPTED'`) a su `estimated_quantity` completa
 * (decisión de producto confirmada explícitamente, no una simplificación
 * unilateral de esta pantalla).
 *
 * Gate de permiso: `transport_schedules.create` (mismo permiso usado por
 * `CreateTransportScheduleForm`, la vía "manual" ya existente de crear una
 * programación) -- no hay un CU-XXX/RN-XXX asignado todavía para esta
 * pantalla en Notion; se preserva el patrón de permisos existente en vez de
 * inventar uno nuevo.
 */
export function TransportScheduleCalendarScreen() {
  const { isAuthorized } = useRequireAuth('transport_schedules.create')

  if (!isAuthorized) {
    return (
      <EcoLinkSpinner />
    )
  }

  return <TransportScheduleCalendarWorkspace />
}
