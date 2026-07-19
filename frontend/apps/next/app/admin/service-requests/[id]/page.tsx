'use client'

import { useParams } from 'solito/navigation'
import { DashboardShell } from '@/components/dashboard-shell'
import { ServiceRequestDetailScreen } from '@/features/admin/service-requests/ServiceRequestDetailScreen'

const useServiceRequestDetailParams = useParams<{ id: string }>

export default function AdminServiceRequestDetailPage() {
  const { id } = useServiceRequestDetailParams()

  return (
    <DashboardShell title="Detalle de Solicitud de Servicio">
      <ServiceRequestDetailScreen serviceRequestId={id} />
    </DashboardShell>
  )
}
