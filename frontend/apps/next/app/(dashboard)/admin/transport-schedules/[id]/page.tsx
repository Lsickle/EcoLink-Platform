import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { TransportScheduleDetailScreen } from '@/features/admin/transport-schedules/TransportScheduleDetailScreen'

export const metadata: Metadata = { title: 'Detalle de Programación de Recolección' }

export default async function AdminTransportScheduleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <SetPageTitle title="Detalle de Programación de Recolección" />
      <TransportScheduleDetailScreen scheduleId={id} />
    </>
  )
}
