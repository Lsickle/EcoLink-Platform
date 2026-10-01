import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { TransportScheduleLocalityMapScreen } from '@/features/admin/transport-schedules/TransportScheduleLocalityMapScreen'

export const metadata: Metadata = { title: 'Programación por Localidad' }

export default function AdminTransportScheduleLocalityMapPage() {
  return (
    <>
      <SetPageTitle title="Programación por Localidad" />
      <TransportScheduleLocalityMapScreen />
    </>
  )
}
