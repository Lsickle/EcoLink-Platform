import { DashboardShell } from '@/components/dashboard-shell'
import { CreateTransportPersonnelForm } from '@/features/admin/transport-personnel/CreateTransportPersonnelForm'

export default function AdminNewTransportPersonnelPage() {
  return (
    <DashboardShell title="Registrar Conductor">
      <CreateTransportPersonnelForm />
    </DashboardShell>
  )
}
