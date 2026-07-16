'use client'

import { useParams } from 'solito/navigation'
import { DashboardShell } from '@/components/dashboard-shell'
import { OrganizationDetailScreen } from '@/features/admin/OrganizationDetailScreen'

const useOrganizationDetailParams = useParams<{ id: string }>

export default function AdminOrganizationDetailPage() {
  const { id } = useOrganizationDetailParams()

  return (
    <DashboardShell title="Detalle de Organización">
      <OrganizationDetailScreen organizationId={id} />
    </DashboardShell>
  )
}
