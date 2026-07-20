import { DashboardShell } from '@/components/dashboard-shell'
import { ManifestLoadsListScreen } from '@/features/admin/manifest-loads/ManifestLoadsListScreen'

export default function AdminManifestLoadsPage() {
  return (
    <DashboardShell title="Manifiestos de Cargue">
      <ManifestLoadsListScreen />
    </DashboardShell>
  )
}
