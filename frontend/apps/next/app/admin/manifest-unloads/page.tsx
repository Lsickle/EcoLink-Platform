import { DashboardShell } from '@/components/dashboard-shell'
import { ManifestUnloadsListScreen } from '@/features/admin/manifest-unloads/ManifestUnloadsListScreen'

export default function AdminManifestUnloadsPage() {
  return (
    <DashboardShell title="Manifiestos de Descargue">
      <ManifestUnloadsListScreen />
    </DashboardShell>
  )
}
