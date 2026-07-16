import { DashboardShell } from '@/components/dashboard-shell'
import { UnCodesListScreen } from '@/features/admin/UnCodesListScreen'

export default function AdminUnCodesPage() {
  return (
    <DashboardShell title="Códigos UN">
      <UnCodesListScreen />
    </DashboardShell>
  )
}
