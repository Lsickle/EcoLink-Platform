import { DashboardShell } from '@/components/dashboard-shell'
import { GeneratorBulkImportScreen } from '@/features/admin/GeneratorBulkImportScreen'

export default function AdminGeneratorBulkImportPage() {
  return (
    <DashboardShell title="Carga Masiva de Generadores">
      <GeneratorBulkImportScreen />
    </DashboardShell>
  )
}
