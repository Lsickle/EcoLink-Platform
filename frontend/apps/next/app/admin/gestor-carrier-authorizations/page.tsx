import { DashboardShell } from '@/components/dashboard-shell'
import { GestorCarrierAuthorizationsListScreen } from '@/features/admin/GestorCarrierAuthorizationsListScreen'

export default function AdminGestorCarrierAuthorizationsPage() {
  return (
    <DashboardShell title="Autorizaciones de Transportador">
      <GestorCarrierAuthorizationsListScreen />
    </DashboardShell>
  )
}
