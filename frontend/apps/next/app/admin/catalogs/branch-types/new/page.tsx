import { DashboardShell } from '@/components/dashboard-shell'
import { CreateBranchTypeForm } from '@/features/admin/catalogs/CreateBranchTypeForm'

export default function AdminNewBranchTypePage() {
  return (
    <DashboardShell title="Crear Tipo de Sucursal">
      <CreateBranchTypeForm />
    </DashboardShell>
  )
}
