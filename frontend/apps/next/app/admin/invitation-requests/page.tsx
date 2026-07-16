import { DashboardShell } from '@/components/dashboard-shell'
import { InvitationRequestsListScreen } from '@/features/admin/InvitationRequestsListScreen'

export default function AdminInvitationRequestsPage() {
  return (
    <DashboardShell title="Solicitudes de Invitación">
      <InvitationRequestsListScreen />
    </DashboardShell>
  )
}
