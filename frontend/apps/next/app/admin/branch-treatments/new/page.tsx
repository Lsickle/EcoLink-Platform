import { DashboardShell } from '@/components/dashboard-shell'
import { CreateBranchTreatmentForm } from '@/features/admin/CreateBranchTreatmentForm'

export default function AdminNewBranchTreatmentPage() {
  return (
    <DashboardShell title="Crear Tratamiento de Sede">
      <CreateBranchTreatmentForm />
    </DashboardShell>
  )
}
