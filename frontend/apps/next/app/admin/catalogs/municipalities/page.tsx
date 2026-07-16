import { DashboardShell } from '@/components/dashboard-shell'
import { MunicipalitiesListScreen } from '@/features/admin/catalogs/MunicipalitiesListScreen'

export default function AdminMunicipalitiesPage() {
  return (
    <DashboardShell title="Municipios">
      <MunicipalitiesListScreen />
    </DashboardShell>
  )
}
