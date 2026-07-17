'use client'

import { useParams } from 'solito/navigation'
import { DashboardShell } from '@/components/dashboard-shell'
import { BranchTreatmentDetailScreen } from '@/features/admin/BranchTreatmentDetailScreen'

const useBranchTreatmentDetailParams = useParams<{ id: string }>

export default function AdminBranchTreatmentDetailPage() {
  const { id } = useBranchTreatmentDetailParams()

  return (
    <DashboardShell title="Detalle de Tratamiento de Sede">
      <BranchTreatmentDetailScreen branchTreatmentId={id} />
    </DashboardShell>
  )
}
