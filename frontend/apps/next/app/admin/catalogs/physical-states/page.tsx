import { DashboardShell } from '@/components/dashboard-shell'
import { PhysicalStatesListScreen } from '@/features/admin/catalogs/PhysicalStatesListScreen'

export default function AdminPhysicalStatesPage() {
  return (
    <DashboardShell title="Estado Físico">
      <PhysicalStatesListScreen />
    </DashboardShell>
  )
}
