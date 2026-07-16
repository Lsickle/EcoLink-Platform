import { DashboardShell } from '@/components/dashboard-shell'
import { CreateWasteStreamForm } from '@/features/admin/CreateWasteStreamForm'

export default function AdminNewWasteStreamPage() {
  return (
    <DashboardShell title="Crear Corriente Y/A">
      <CreateWasteStreamForm />
    </DashboardShell>
  )
}
