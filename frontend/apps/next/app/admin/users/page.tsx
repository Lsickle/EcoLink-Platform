import { DashboardShell } from '@/components/dashboard-shell'
import { UsersListScreen } from '@/features/admin/UsersListScreen'

export default function AdminUsersPage() {
  return (
    <DashboardShell title="Usuarios">
      <UsersListScreen />
    </DashboardShell>
  )
}
