import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { PackagingConditionDetailScreen } from '@/features/admin/catalogs/PackagingConditionDetailScreen'

export const metadata: Metadata = { title: 'Detalle de Estado del Embalaje' }

export default async function AdminPackagingConditionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <SetPageTitle title="Detalle de Estado del Embalaje" />
      <PackagingConditionDetailScreen packagingConditionId={id} />
    </>
  )
}
