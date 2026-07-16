import { DashboardShell } from '@/components/dashboard-shell'
import { PackagingTypesListScreen } from '@/features/admin/catalogs/PackagingTypesListScreen'

export default function AdminPackagingTypesPage() {
  return (
    <DashboardShell title="Tipos de Embalaje">
      <PackagingTypesListScreen />
    </DashboardShell>
  )
}
