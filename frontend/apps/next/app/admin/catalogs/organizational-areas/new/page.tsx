import { DashboardShell } from '@/components/dashboard-shell'
import { CreateOrganizationalAreaForm } from '@/features/admin/catalogs/CreateOrganizationalAreaForm'

export default function AdminNewOrganizationalAreaPage() {
  return (
    <DashboardShell title="Crear Área Organizacional">
      <CreateOrganizationalAreaForm />
    </DashboardShell>
  )
}
