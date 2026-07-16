'use client'

import { useParams } from 'solito/navigation'
import { DashboardShell } from '@/components/dashboard-shell'
import { RoleDetailScreen } from '@/features/admin/RoleDetailScreen'

const useRoleDetailParams = useParams<{ id: string }>

export default function AdminRoleDetailPage() {
  const { id } = useRoleDetailParams()

  return (
    <DashboardShell title="Detalle de Rol">
      <RoleDetailScreen roleId={id} />
    </DashboardShell>
  )
}
