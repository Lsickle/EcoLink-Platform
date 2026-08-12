import { DashboardShell } from '@/components/dashboard-shell'
import { WasteBulkImportScreen } from '@/features/admin/WasteBulkImportScreen'

export default function AdminWasteBulkImportPage() {
  return (
    <DashboardShell title="Carga Masiva de Residuos">
      <WasteBulkImportScreen />
    </DashboardShell>
  )
}
