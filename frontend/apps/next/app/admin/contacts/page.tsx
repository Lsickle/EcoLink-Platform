import { DashboardShell } from '@/components/dashboard-shell'
import { ContactsListScreen } from '@/features/admin/ContactsListScreen'

export default function AdminContactsPage() {
  return (
    <DashboardShell title="Contactos">
      <ContactsListScreen />
    </DashboardShell>
  )
}
