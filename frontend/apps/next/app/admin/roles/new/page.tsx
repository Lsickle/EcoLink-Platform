import { DashboardShell } from '@/components/dashboard-shell'
import { RoleWizard } from '@/features/admin/RoleWizard'

export default function AdminNewRolePage() {
  return (
    <DashboardShell title="Crear Rol">
      <RoleWizard />
    </DashboardShell>
  )
}
