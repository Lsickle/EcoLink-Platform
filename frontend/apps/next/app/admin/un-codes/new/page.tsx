import { DashboardShell } from '@/components/dashboard-shell'
import { CreateUnCodeForm } from '@/features/admin/CreateUnCodeForm'

export default function AdminNewUnCodePage() {
  return (
    <DashboardShell title="Crear Código UN">
      <CreateUnCodeForm />
    </DashboardShell>
  )
}
