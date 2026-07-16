import { DashboardShell } from '@/components/dashboard-shell'
import { CreatePackagingConditionForm } from '@/features/admin/catalogs/CreatePackagingConditionForm'

export default function AdminNewPackagingConditionPage() {
  return (
    <DashboardShell title="Crear Estado del Embalaje">
      <CreatePackagingConditionForm />
    </DashboardShell>
  )
}
