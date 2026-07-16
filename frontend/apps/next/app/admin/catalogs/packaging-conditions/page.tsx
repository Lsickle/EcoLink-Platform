import { DashboardShell } from '@/components/dashboard-shell'
import { PackagingConditionsListScreen } from '@/features/admin/catalogs/PackagingConditionsListScreen'

export default function AdminPackagingConditionsPage() {
  return (
    <DashboardShell title="Estados del Embalaje">
      <PackagingConditionsListScreen />
    </DashboardShell>
  )
}
