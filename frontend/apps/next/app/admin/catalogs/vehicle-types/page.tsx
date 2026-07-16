import { DashboardShell } from '@/components/dashboard-shell'
import { VehicleTypesListScreen } from '@/features/admin/catalogs/VehicleTypesListScreen'

export default function AdminVehicleTypesPage() {
  return (
    <DashboardShell title="Tipos de Vehículo">
      <VehicleTypesListScreen />
    </DashboardShell>
  )
}
