'use client'

import { useParams } from 'solito/navigation'
import { DashboardShell } from '@/components/dashboard-shell'
import { OrganizationalAreaDetailScreen } from '@/features/admin/catalogs/OrganizationalAreaDetailScreen'

const useOrganizationalAreaDetailParams = useParams<{ id: string }>

export default function AdminOrganizationalAreaDetailPage() {
  const { id } = useOrganizationalAreaDetailParams()

  return (
    <DashboardShell title="Detalle de Área Organizacional">
      <OrganizationalAreaDetailScreen organizationalAreaId={id} />
    </DashboardShell>
  )
}
