'use client'

import { useParams } from 'solito/navigation'
import { DashboardShell } from '@/components/dashboard-shell'
import { BranchDetailScreen } from '@/features/admin/BranchDetailScreen'

const useBranchDetailParams = useParams<{ id: string }>

export default function AdminBranchDetailPage() {
  const { id } = useBranchDetailParams()

  return (
    <DashboardShell title="Detalle de Sede">
      <BranchDetailScreen branchId={id} />
    </DashboardShell>
  )
}
