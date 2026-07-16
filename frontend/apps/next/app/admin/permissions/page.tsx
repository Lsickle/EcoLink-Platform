import { DashboardShell } from '@/components/dashboard-shell'
import { PermissionsListScreen } from '@/features/admin/PermissionsListScreen'

export default function AdminPermissionsPage() {
  return (
    <DashboardShell title="Permisos">
      <PermissionsListScreen />
    </DashboardShell>
  )
}
