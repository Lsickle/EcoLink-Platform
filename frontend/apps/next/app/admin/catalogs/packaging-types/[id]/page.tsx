'use client'

import { useParams } from 'solito/navigation'
import { DashboardShell } from '@/components/dashboard-shell'
import { PackagingTypeDetailScreen } from '@/features/admin/catalogs/PackagingTypeDetailScreen'

const usePackagingTypeDetailParams = useParams<{ id: string }>

export default function AdminPackagingTypeDetailPage() {
  const { id } = usePackagingTypeDetailParams()

  return (
    <DashboardShell title="Detalle de Tipo de Embalaje">
      <PackagingTypeDetailScreen packagingTypeId={id} />
    </DashboardShell>
  )
}
