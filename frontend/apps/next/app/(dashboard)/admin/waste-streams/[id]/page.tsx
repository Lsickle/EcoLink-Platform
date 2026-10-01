import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { WasteStreamDetailScreen } from '@/features/admin/WasteStreamDetailScreen'

export const metadata: Metadata = { title: 'Detalle de Corriente' }

export default async function AdminWasteStreamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <SetPageTitle title="Detalle de Corriente" />
      <WasteStreamDetailScreen wasteStreamId={id} />
    </>
  )
}
