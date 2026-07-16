'use client'

import { useParams } from 'solito/navigation'
import { DashboardShell } from '@/components/dashboard-shell'
import { BranchTypeDetailScreen } from '@/features/admin/catalogs/BranchTypeDetailScreen'

const useBranchTypeDetailParams = useParams<{ id: string }>

export default function AdminBranchTypeDetailPage() {
  const { id } = useBranchTypeDetailParams()

  return (
    <DashboardShell title="Detalle de Tipo de Sede">
      <BranchTypeDetailScreen branchTypeId={id} />
    </DashboardShell>
  )
}
