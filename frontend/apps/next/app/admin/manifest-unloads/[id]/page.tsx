'use client'

import { useParams } from 'solito/navigation'
import { DashboardShell } from '@/components/dashboard-shell'
import { ManifestUnloadDetailScreen } from '@/features/admin/manifest-unloads/ManifestUnloadDetailScreen'

const useManifestUnloadDetailParams = useParams<{ id: string }>

export default function AdminManifestUnloadDetailPage() {
  const { id } = useManifestUnloadDetailParams()

  return (
    <DashboardShell title="Detalle de Manifiesto de Descargue">
      <ManifestUnloadDetailScreen manifestUnloadId={id} />
    </DashboardShell>
  )
}
