import { DashboardShell } from '@/components/dashboard-shell'
import { PreapprovedWastesListScreen } from '@/features/admin/waste/PreapprovedWastesListScreen'

export default function AdminPreapprovedWastesPage() {
  return (
    <DashboardShell title="Residuos Preaprobados">
      <PreapprovedWastesListScreen />
    </DashboardShell>
  )
}
