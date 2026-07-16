import { DashboardShell } from '@/components/dashboard-shell'
import { PermissionsMatrixScreen } from '@/features/admin/PermissionsMatrixScreen'

export default function AdminPermissionsMatrixPage() {
  return (
    <DashboardShell title="Matriz de Permisos">
      <PermissionsMatrixScreen />
    </DashboardShell>
  )
}
