import { DashboardShell } from '@/components/dashboard-shell'
import { CreatePreapprovedWasteForm } from '@/features/admin/waste/CreatePreapprovedWasteForm'

export default function AdminNewPreapprovedWastePage() {
  return (
    <DashboardShell title="Crear Residuo Preaprobado">
      <CreatePreapprovedWasteForm />
    </DashboardShell>
  )
}
