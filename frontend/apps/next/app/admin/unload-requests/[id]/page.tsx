'use client'

import { useParams } from 'solito/navigation'
import { DashboardShell } from '@/components/dashboard-shell'
import { UnloadRequestDetailScreen } from '@/features/admin/unload-requests/UnloadRequestDetailScreen'

const useUnloadRequestDetailParams = useParams<{ id: string }>

export default function AdminUnloadRequestDetailPage() {
  const { id } = useUnloadRequestDetailParams()

  return (
    <DashboardShell title="Detalle de Solicitud de Descargue">
      <UnloadRequestDetailScreen unloadRequestId={id} />
    </DashboardShell>
  )
}
