import { DashboardShell } from '@/components/dashboard-shell'
import { CreateWasteCategoryForm } from '@/features/admin/catalogs/CreateWasteCategoryForm'

export default function AdminNewWasteCategoryPage() {
  return (
    <DashboardShell title="Crear Categoría de Residuo">
      <CreateWasteCategoryForm />
    </DashboardShell>
  )
}
