import { DashboardShell } from '@/components/dashboard-shell'
import { UnloadRequestsListScreen } from '@/features/admin/unload-requests/UnloadRequestsListScreen'

export default function AdminUnloadRequestsPage() {
  return (
    <DashboardShell title="Solicitudes de Descargue">
      <UnloadRequestsListScreen />
    </DashboardShell>
  )
}
