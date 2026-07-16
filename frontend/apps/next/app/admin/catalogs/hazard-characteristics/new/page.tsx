import { DashboardShell } from '@/components/dashboard-shell'
import { CreateHazardCharacteristicForm } from '@/features/admin/catalogs/CreateHazardCharacteristicForm'

export default function AdminNewHazardCharacteristicPage() {
  return (
    <DashboardShell title="Crear Característica de Peligrosidad">
      <CreateHazardCharacteristicForm />
    </DashboardShell>
  )
}
