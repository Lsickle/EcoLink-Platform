import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { UnCodeDetailScreen } from '@/features/admin/UnCodeDetailScreen'

export const metadata: Metadata = { title: 'Detalle de Código UN' }

export default async function AdminUnCodeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <SetPageTitle title="Detalle de Código UN" />
      <UnCodeDetailScreen unCodeId={id} />
    </>
  )
}
