import { DashboardShell } from '@/components/dashboard-shell'
import { CreatePhysicalStateForm } from '@/features/admin/catalogs/CreatePhysicalStateForm'

export default function AdminNewPhysicalStatePage() {
  return (
    <DashboardShell title="Crear Estado Físico">
      <CreatePhysicalStateForm />
    </DashboardShell>
  )
}
