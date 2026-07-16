import { DashboardShell } from '@/components/dashboard-shell'
import { DepartmentsListScreen } from '@/features/admin/catalogs/DepartmentsListScreen'

export default function AdminDepartmentsPage() {
  return (
    <DashboardShell title="Departamentos">
      <DepartmentsListScreen />
    </DashboardShell>
  )
}
