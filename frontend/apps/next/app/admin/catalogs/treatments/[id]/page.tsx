'use client'

import { useParams } from 'solito/navigation'
import { DashboardShell } from '@/components/dashboard-shell'
import { TreatmentDetailScreen } from '@/features/admin/catalogs/TreatmentDetailScreen'

const useTreatmentDetailParams = useParams<{ id: string }>

export default function AdminTreatmentDetailPage() {
  const { id } = useTreatmentDetailParams()

  return (
    <DashboardShell title="Detalle de Tratamiento">
      <TreatmentDetailScreen treatmentId={id} />
    </DashboardShell>
  )
}
