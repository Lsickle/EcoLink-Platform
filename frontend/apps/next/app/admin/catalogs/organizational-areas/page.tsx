import { DashboardShell } from '@/components/dashboard-shell'
import { OrganizationalAreasListScreen } from '@/features/admin/catalogs/OrganizationalAreasListScreen'

export default function AdminOrganizationalAreasPage() {
  return (
    <DashboardShell title="Áreas Organizacionales">
      <OrganizationalAreasListScreen />
    </DashboardShell>
  )
}
