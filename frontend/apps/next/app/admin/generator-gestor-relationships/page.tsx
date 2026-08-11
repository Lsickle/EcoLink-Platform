import { DashboardShell } from '@/components/dashboard-shell'
import { GeneratorGestorRelationshipsListScreen } from '@/features/admin/GeneratorGestorRelationshipsListScreen'

export default function AdminGeneratorGestorRelationshipsPage() {
  return (
    <DashboardShell title="Generadores por Gestor">
      <GeneratorGestorRelationshipsListScreen />
    </DashboardShell>
  )
}
