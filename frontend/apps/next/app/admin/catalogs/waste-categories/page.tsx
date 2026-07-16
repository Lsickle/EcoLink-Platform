import { DashboardShell } from '@/components/dashboard-shell'
import { WasteCategoriesListScreen } from '@/features/admin/catalogs/WasteCategoriesListScreen'

export default function AdminWasteCategoriesPage() {
  return (
    <DashboardShell title="Categoría de Residuo">
      <WasteCategoriesListScreen />
    </DashboardShell>
  )
}
