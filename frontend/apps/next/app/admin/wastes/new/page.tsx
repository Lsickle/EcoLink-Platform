import { DashboardShell } from '@/components/dashboard-shell'
import { WasteWizard } from '@/features/admin/waste/WasteWizard'

export default function AdminNewWastePage() {
  return (
    <DashboardShell title="Declarar Residuo">
      <WasteWizard />
    </DashboardShell>
  )
}
