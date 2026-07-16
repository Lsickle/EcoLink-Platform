import { DashboardShell } from '@/components/dashboard-shell'
import { RolesListScreen } from '@/features/admin/RolesListScreen'

export default function AdminRolesPage() {
  return (
    <DashboardShell title="Roles">
      <RolesListScreen />
    </DashboardShell>
  )
}
