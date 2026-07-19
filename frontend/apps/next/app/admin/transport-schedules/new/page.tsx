import { DashboardShell } from '@/components/dashboard-shell'
import { CreateTransportScheduleForm } from '@/features/admin/transport-schedules/CreateTransportScheduleForm'

export default function AdminNewTransportSchedulePage() {
  return (
    <DashboardShell title="Nueva Programación de Recolección">
      <CreateTransportScheduleForm />
    </DashboardShell>
  )
}
