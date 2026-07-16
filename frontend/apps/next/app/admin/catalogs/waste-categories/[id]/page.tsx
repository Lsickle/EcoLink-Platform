'use client'

import { useParams } from 'solito/navigation'
import { DashboardShell } from '@/components/dashboard-shell'
import { WasteCategoryDetailScreen } from '@/features/admin/catalogs/WasteCategoryDetailScreen'

const useWasteCategoryDetailParams = useParams<{ id: string }>

export default function AdminWasteCategoryDetailPage() {
  const { id } = useWasteCategoryDetailParams()

  return (
    <DashboardShell title="Detalle de Categoría de Residuo">
      <WasteCategoryDetailScreen wasteCategoryId={id} />
    </DashboardShell>
  )
}
