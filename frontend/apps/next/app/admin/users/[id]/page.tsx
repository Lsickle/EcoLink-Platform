'use client'

import { useParams } from 'solito/navigation'
import { DashboardShell } from '@/components/dashboard-shell'
import { UserDetailScreen } from '@/features/admin/UserDetailScreen'

const useUserDetailParams = useParams<{ id: string }>

export default function AdminUserDetailPage() {
  const { id } = useUserDetailParams()

  return (
    <DashboardShell title="Detalle de Usuario">
      <UserDetailScreen userId={id} />
    </DashboardShell>
  )
}
