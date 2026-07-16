'use client'

import { useParams } from 'solito/navigation'
import { DashboardShell } from '@/components/dashboard-shell'
import { UnCodeDetailScreen } from '@/features/admin/UnCodeDetailScreen'

const useUnCodeDetailParams = useParams<{ id: string }>

export default function AdminUnCodeDetailPage() {
  const { id } = useUnCodeDetailParams()

  return (
    <DashboardShell title="Detalle de Código UN">
      <UnCodeDetailScreen unCodeId={id} />
    </DashboardShell>
  )
}
