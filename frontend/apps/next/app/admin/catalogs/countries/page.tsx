import { DashboardShell } from '@/components/dashboard-shell'
import { CountriesListScreen } from '@/features/admin/catalogs/CountriesListScreen'

export default function AdminCountriesPage() {
  return (
    <DashboardShell title="Países">
      <CountriesListScreen />
    </DashboardShell>
  )
}
