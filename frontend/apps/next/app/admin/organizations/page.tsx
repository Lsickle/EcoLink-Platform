import { DashboardShell } from '@/components/dashboard-shell'
import { OrganizationsListScreen } from '@/features/admin/OrganizationsListScreen'

export default function AdminOrganizationsPage() {
  return (
    <DashboardShell title="Organizaciones">
      <OrganizationsListScreen />
    </DashboardShell>
  )
}
