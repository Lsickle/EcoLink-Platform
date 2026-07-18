'use client'

import { useParams } from 'solito/navigation'
import { DashboardShell } from '@/components/dashboard-shell'
import { PreapprovedWasteDetailScreen } from '@/features/admin/waste/PreapprovedWasteDetailScreen'

const usePreapprovedWasteDetailParams = useParams<{ id: string }>

export default function AdminPreapprovedWasteDetailPage() {
  const { id } = usePreapprovedWasteDetailParams()

  return (
    <DashboardShell title="Detalle de Residuo Preaprobado">
      <PreapprovedWasteDetailScreen preapprovedWasteId={id} />
    </DashboardShell>
  )
}
