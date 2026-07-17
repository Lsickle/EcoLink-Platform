import { DashboardShell } from '@/components/dashboard-shell'
import { WastesListScreen } from '@/features/admin/waste/WastesListScreen'

export default function AdminWastesPage() {
  return (
    <DashboardShell title="Residuos">
      <WastesListScreen />
    </DashboardShell>
  )
}
