import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { ManifestUnloadDetailScreen } from '@/features/admin/manifest-unloads/ManifestUnloadDetailScreen'

export const metadata: Metadata = { title: 'Detalle de Manifiesto de Descargue' }

export default async function AdminManifestUnloadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <SetPageTitle title="Detalle de Manifiesto de Descargue" />
      <ManifestUnloadDetailScreen manifestUnloadId={id} />
    </>
  )
}
