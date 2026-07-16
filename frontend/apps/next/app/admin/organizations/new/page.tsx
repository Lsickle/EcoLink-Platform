import { DashboardShell } from '@/components/dashboard-shell'
import { CreateOrganizationForm } from '@/features/admin/CreateOrganizationForm'

export default function AdminNewOrganizationPage() {
  return (
    <DashboardShell title="Crear Organización">
      <CreateOrganizationForm />
    </DashboardShell>
  )
}
