'use client'

import { useParams } from 'solito/navigation'
import { DashboardShell } from '@/components/dashboard-shell'
import { PackagingConditionDetailScreen } from '@/features/admin/catalogs/PackagingConditionDetailScreen'

const usePackagingConditionDetailParams = useParams<{ id: string }>

export default function AdminPackagingConditionDetailPage() {
  const { id } = usePackagingConditionDetailParams()

  return (
    <DashboardShell title="Detalle de Estado del Embalaje">
      <PackagingConditionDetailScreen packagingConditionId={id} />
    </DashboardShell>
  )
}
