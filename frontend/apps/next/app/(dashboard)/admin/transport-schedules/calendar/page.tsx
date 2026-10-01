import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { TransportScheduleCalendarScreen } from '@/features/admin/transport-schedules/TransportScheduleCalendarScreen'

export const metadata: Metadata = { title: 'Programación de Servicios — Calendario' }

export default function AdminTransportScheduleCalendarPage() {
  return (
    <>
      <SetPageTitle title="Programación de Servicios — Calendario" />
      <TransportScheduleCalendarScreen />
    </>
  )
}
