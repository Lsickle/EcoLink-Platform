'use client'

import { useParams } from 'solito/navigation'
import { DashboardShell } from '@/components/dashboard-shell'
import { WasteStreamDetailScreen } from '@/features/admin/WasteStreamDetailScreen'

const useWasteStreamDetailParams = useParams<{ id: string }>

export default function AdminWasteStreamDetailPage() {
  const { id } = useWasteStreamDetailParams()

  return (
    <DashboardShell title="Detalle de Corriente">
      <WasteStreamDetailScreen wasteStreamId={id} />
    </DashboardShell>
  )
}
