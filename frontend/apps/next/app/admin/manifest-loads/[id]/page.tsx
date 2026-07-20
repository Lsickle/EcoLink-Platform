'use client'

import { useParams } from 'solito/navigation'
import { DashboardShell } from '@/components/dashboard-shell'
import { ManifestLoadDetailScreen } from '@/features/admin/manifest-loads/ManifestLoadDetailScreen'

const useManifestLoadDetailParams = useParams<{ id: string }>

export default function AdminManifestLoadDetailPage() {
  const { id } = useManifestLoadDetailParams()

  return (
    <DashboardShell title="Detalle de Manifiesto de Cargue">
      <ManifestLoadDetailScreen manifestLoadId={id} />
    </DashboardShell>
  )
}
