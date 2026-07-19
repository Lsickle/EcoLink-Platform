import { DashboardShell } from '@/components/dashboard-shell'
import { TransportPersonnelListScreen } from '@/features/admin/transport-personnel/TransportPersonnelListScreen'

export default function AdminTransportPersonnelPage() {
  return (
    <DashboardShell title="Conductores">
      <TransportPersonnelListScreen />
    </DashboardShell>
  )
}
