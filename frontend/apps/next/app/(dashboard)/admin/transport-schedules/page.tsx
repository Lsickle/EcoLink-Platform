import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { TransportSchedulesListScreen } from '@/features/admin/transport-schedules/TransportSchedulesListScreen'

export const metadata: Metadata = { title: 'Programación de Recolección' }

export default function AdminTransportSchedulesPage() {
  return (
    <>
      <SetPageTitle title="Programación de Recolección" />
      <TransportSchedulesListScreen />
    </>
  )
}
