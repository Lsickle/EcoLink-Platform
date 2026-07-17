import { DashboardShell } from '@/components/dashboard-shell'
import { BranchTreatmentsListScreen } from '@/features/admin/BranchTreatmentsListScreen'

export default function AdminBranchTreatmentsPage() {
  return (
    <DashboardShell title="Tratamientos de Sucursal">
      <BranchTreatmentsListScreen />
    </DashboardShell>
  )
}
