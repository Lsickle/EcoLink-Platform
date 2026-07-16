'use client'

import { useParams } from 'solito/navigation'
import { DashboardShell } from '@/components/dashboard-shell'
import { PermissionDetailScreen } from '@/features/admin/PermissionDetailScreen'

const usePermissionDetailParams = useParams<{ id: string }>

export default function AdminPermissionDetailPage() {
  const { id } = usePermissionDetailParams()

  return (
    <DashboardShell title="Detalle de Permiso">
      <PermissionDetailScreen permissionId={id} />
    </DashboardShell>
  )
}
