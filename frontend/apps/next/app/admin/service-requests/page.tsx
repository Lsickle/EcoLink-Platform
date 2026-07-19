import { DashboardShell } from '@/components/dashboard-shell'
import { ServiceRequestsListScreen } from '@/features/admin/service-requests/ServiceRequestsListScreen'

export default function AdminServiceRequestsPage() {
  return (
    <DashboardShell title="Solicitudes de Servicio">
      <ServiceRequestsListScreen />
    </DashboardShell>
  )
}
