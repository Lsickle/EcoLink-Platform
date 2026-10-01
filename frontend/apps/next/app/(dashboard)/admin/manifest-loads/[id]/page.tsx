import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { ManifestLoadDetailScreen } from '@/features/admin/manifest-loads/ManifestLoadDetailScreen'

export const metadata: Metadata = { title: 'Detalle de Manifiesto de Cargue' }

export default async function AdminManifestLoadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <SetPageTitle title="Detalle de Manifiesto de Cargue" />
      <ManifestLoadDetailScreen manifestLoadId={id} />
    </>
  )
}
