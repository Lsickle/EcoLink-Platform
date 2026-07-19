import { DashboardShell } from '@/components/dashboard-shell'
import { TransportSchedulesListScreen } from '@/features/admin/transport-schedules/TransportSchedulesListScreen'

export default function AdminTransportSchedulesPage() {
  return (
    <DashboardShell title="Programación de Recolección">
      <TransportSchedulesListScreen />
    </DashboardShell>
  )
}
