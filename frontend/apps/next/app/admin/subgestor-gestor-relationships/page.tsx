import { DashboardShell } from '@/components/dashboard-shell'
import { SubgestorGestorRelationshipsListScreen } from '@/features/admin/SubgestorGestorRelationshipsListScreen'

export default function AdminSubgestorGestorRelationshipsPage() {
  return (
    <DashboardShell title="Gestores Vinculados">
      <SubgestorGestorRelationshipsListScreen />
    </DashboardShell>
  )
}
