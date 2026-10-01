import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { TransportPersonnelDetailScreen } from '@/features/admin/transport-personnel/TransportPersonnelDetailScreen'

export const metadata: Metadata = { title: 'Detalle de Conductor' }

export default async function AdminTransportPersonnelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <SetPageTitle title="Detalle de Conductor" />
      <TransportPersonnelDetailScreen transportPersonnelId={id} />
    </>
  )
}
