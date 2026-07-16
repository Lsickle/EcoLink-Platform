import { DashboardShell } from '@/components/dashboard-shell'
import { WasteStreamsListScreen } from '@/features/admin/WasteStreamsListScreen'

export default function AdminWasteStreamsPage() {
  return (
    <DashboardShell title="Corrientes Y/A">
      <WasteStreamsListScreen />
    </DashboardShell>
  )
}
