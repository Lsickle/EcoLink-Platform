import { DashboardShell } from '@/components/dashboard-shell'
import { CreateUserForm } from '@/features/admin/CreateUserForm'

export default function AdminNewUserPage() {
  return (
    <DashboardShell title="Crear Usuario">
      <CreateUserForm />
    </DashboardShell>
  )
}
