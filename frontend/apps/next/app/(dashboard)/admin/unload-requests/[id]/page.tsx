import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { UnloadRequestDetailScreen } from '@/features/admin/unload-requests/UnloadRequestDetailScreen'

export const metadata: Metadata = { title: 'Detalle de Solicitud de Descargue' }

export default async function AdminUnloadRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <SetPageTitle title="Detalle de Solicitud de Descargue" />
      <UnloadRequestDetailScreen unloadRequestId={id} />
    </>
  )
}
