import { DashboardShell } from '@/components/dashboard-shell'
import { CreateTreatmentForm } from '@/features/admin/catalogs/CreateTreatmentForm'

export default function AdminNewTreatmentPage() {
  return (
    <DashboardShell title="Crear Tratamiento">
      <CreateTreatmentForm />
    </DashboardShell>
  )
}
