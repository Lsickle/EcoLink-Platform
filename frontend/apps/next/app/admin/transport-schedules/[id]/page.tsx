'use client'

import { useParams } from 'solito/navigation'
import { DashboardShell } from '@/components/dashboard-shell'
import { TransportScheduleDetailScreen } from '@/features/admin/transport-schedules/TransportScheduleDetailScreen'

const useTransportScheduleDetailParams = useParams<{ id: string }>

export default function AdminTransportScheduleDetailPage() {
  const { id } = useTransportScheduleDetailParams()

  return (
    <DashboardShell title="Detalle de Programación de Recolección">
      <TransportScheduleDetailScreen scheduleId={id} />
    </DashboardShell>
  )
}
