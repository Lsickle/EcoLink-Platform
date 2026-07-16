import { DashboardShell } from '@/components/dashboard-shell'
import { HazardCharacteristicsListScreen } from '@/features/admin/catalogs/HazardCharacteristicsListScreen'

export default function AdminHazardCharacteristicsPage() {
  return (
    <DashboardShell title="Características de Peligrosidad">
      <HazardCharacteristicsListScreen />
    </DashboardShell>
  )
}
