'use client'

import { useParams } from 'solito/navigation'
import { DashboardShell } from '@/components/dashboard-shell'
import { PhysicalStateDetailScreen } from '@/features/admin/catalogs/PhysicalStateDetailScreen'

const usePhysicalStateDetailParams = useParams<{ id: string }>

export default function AdminPhysicalStateDetailPage() {
  const { id } = usePhysicalStateDetailParams()

  return (
    <DashboardShell title="Detalle de Estado Físico">
      <PhysicalStateDetailScreen physicalStateId={id} />
    </DashboardShell>
  )
}
