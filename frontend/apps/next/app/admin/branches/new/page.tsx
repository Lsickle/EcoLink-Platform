import { DashboardShell } from '@/components/dashboard-shell'
import { CreateBranchForm } from '@/features/admin/CreateBranchForm'

export default function AdminNewBranchPage() {
  return (
    <DashboardShell title="Crear Sucursal">
      <CreateBranchForm />
    </DashboardShell>
  )
}
