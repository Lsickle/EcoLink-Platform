import { DashboardShell } from '@/components/dashboard-shell'
import { BranchesListScreen } from '@/features/admin/BranchesListScreen'

export default function AdminBranchesPage() {
  return (
    <DashboardShell title="Sucursales">
      <BranchesListScreen />
    </DashboardShell>
  )
}
