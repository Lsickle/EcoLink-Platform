import { DashboardShell } from '@/components/dashboard-shell'
import { CreatePackagingTypeForm } from '@/features/admin/catalogs/CreatePackagingTypeForm'

export default function AdminNewPackagingTypePage() {
  return (
    <DashboardShell title="Crear Tipo de Embalaje">
      <CreatePackagingTypeForm />
    </DashboardShell>
  )
}
