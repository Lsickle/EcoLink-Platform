import { DashboardShell } from '@/components/dashboard-shell'
import { BranchTypesListScreen } from '@/features/admin/catalogs/BranchTypesListScreen'

export default function AdminBranchTypesPage() {
  return (
    <DashboardShell title="Tipos de Sucursal">
      <BranchTypesListScreen />
    </DashboardShell>
  )
}
