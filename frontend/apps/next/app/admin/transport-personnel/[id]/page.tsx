'use client'

import { useParams } from 'solito/navigation'
import { DashboardShell } from '@/components/dashboard-shell'
import { TransportPersonnelDetailScreen } from '@/features/admin/transport-personnel/TransportPersonnelDetailScreen'

const useTransportPersonnelDetailParams = useParams<{ id: string }>

export default function AdminTransportPersonnelDetailPage() {
  const { id } = useTransportPersonnelDetailParams()

  return (
    <DashboardShell title="Detalle de Conductor">
      <TransportPersonnelDetailScreen transportPersonnelId={id} />
    </DashboardShell>
  )
}
