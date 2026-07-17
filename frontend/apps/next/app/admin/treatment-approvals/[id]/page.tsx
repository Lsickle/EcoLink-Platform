'use client'

import { useParams } from 'solito/navigation'
import { DashboardShell } from '@/components/dashboard-shell'
import { TreatmentApprovalDetailScreen } from '@/features/admin/waste/TreatmentApprovalDetailScreen'

const useTreatmentApprovalDetailParams = useParams<{ id: string }>

export default function AdminTreatmentApprovalDetailPage() {
  const { id } = useTreatmentApprovalDetailParams()

  return (
    <DashboardShell title="Detalle de Evaluación de Tratamiento">
      <TreatmentApprovalDetailScreen treatmentApprovalId={id} />
    </DashboardShell>
  )
}
