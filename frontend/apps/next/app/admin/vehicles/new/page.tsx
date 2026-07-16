import { DashboardShell } from '@/components/dashboard-shell'
import { CreateVehicleForm } from '@/features/admin/CreateVehicleForm'

export default function AdminNewVehiclePage() {
  return (
    <DashboardShell title="Crear Vehículo">
      <CreateVehicleForm />
    </DashboardShell>
  )
}
