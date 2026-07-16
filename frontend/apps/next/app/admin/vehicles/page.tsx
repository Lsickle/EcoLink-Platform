import { DashboardShell } from '@/components/dashboard-shell'
import { VehiclesListScreen } from '@/features/admin/VehiclesListScreen'

export default function AdminVehiclesPage() {
  return (
    <DashboardShell title="Vehículos">
      <VehiclesListScreen />
    </DashboardShell>
  )
}
