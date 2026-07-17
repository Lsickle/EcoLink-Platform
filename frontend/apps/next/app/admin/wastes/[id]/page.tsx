'use client'

import { useParams } from 'solito/navigation'
import { DashboardShell } from '@/components/dashboard-shell'
import { WasteDetailScreen } from '@/features/admin/waste/WasteDetailScreen'

const useWasteDetailParams = useParams<{ id: string }>

export default function AdminWasteDetailPage() {
  const { id } = useWasteDetailParams()

  return (
    <DashboardShell title="Detalle de Residuo">
      <WasteDetailScreen wasteId={id} />
    </DashboardShell>
  )
}
