import { DashboardShell } from '@/components/dashboard-shell'
import { TreatmentApprovalsListScreen } from '@/features/admin/waste/TreatmentApprovalsListScreen'

export default function AdminTreatmentApprovalsPage() {
  return (
    <DashboardShell title="Evaluaciones de Tratamiento">
      <TreatmentApprovalsListScreen />
    </DashboardShell>
  )
}
