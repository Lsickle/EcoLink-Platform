import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { PhysicalStateDetailScreen } from '@/features/admin/catalogs/PhysicalStateDetailScreen'

export const metadata: Metadata = { title: 'Detalle de Estado Físico' }

export default async function AdminPhysicalStateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <SetPageTitle title="Detalle de Estado Físico" />
      <PhysicalStateDetailScreen physicalStateId={id} />
    </>
  )
}
