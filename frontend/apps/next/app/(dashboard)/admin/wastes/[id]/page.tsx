import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { WasteDetailScreen } from '@/features/admin/waste/WasteDetailScreen'

export const metadata: Metadata = { title: 'Detalle de Residuo' }

export default async function AdminWasteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <SetPageTitle title="Detalle de Residuo" />
      <WasteDetailScreen wasteId={id} />
    </>
  )
}
