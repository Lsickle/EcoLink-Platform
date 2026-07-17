import { DashboardShell } from '@/components/dashboard-shell'
import { TreatmentsListScreen } from '@/features/admin/catalogs/TreatmentsListScreen'

export default function AdminTreatmentsPage() {
  return (
    <DashboardShell title="Tratamientos">
      <TreatmentsListScreen />
    </DashboardShell>
  )
}
