import { DashboardShell } from '@/components/dashboard-shell'
import { CreateVehicleTypeForm } from '@/features/admin/catalogs/CreateVehicleTypeForm'

export default function AdminNewVehicleTypePage() {
  return (
    <DashboardShell title="Crear Tipo de Vehículo">
      <CreateVehicleTypeForm />
    </DashboardShell>
  )
}
