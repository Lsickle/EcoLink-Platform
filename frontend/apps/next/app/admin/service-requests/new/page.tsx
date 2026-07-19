import { DashboardShell } from '@/components/dashboard-shell'
import { ServiceRequestWizard } from '@/features/admin/service-requests/ServiceRequestWizard'

export default function AdminNewServiceRequestPage() {
  return (
    <DashboardShell title="Nueva Solicitud de Servicio">
      <ServiceRequestWizard />
    </DashboardShell>
  )
}
