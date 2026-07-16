import { DashboardShell } from '@/components/dashboard-shell'
import { LocalitiesListScreen } from '@/features/admin/catalogs/LocalitiesListScreen'

export default function AdminLocalitiesPage() {
  return (
    <DashboardShell title="Localidades">
      <LocalitiesListScreen />
    </DashboardShell>
  )
}
