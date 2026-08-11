import { DashboardShell } from '@/components/dashboard-shell'
import { GeneratorSubgestorRelationshipsListScreen } from '@/features/admin/GeneratorSubgestorRelationshipsListScreen'

export default function AdminGeneratorSubgestorRelationshipsPage() {
  return (
    <DashboardShell title="Generadores por Subgestor">
      <GeneratorSubgestorRelationshipsListScreen />
    </DashboardShell>
  )
}
