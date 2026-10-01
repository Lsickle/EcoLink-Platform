import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { PackagingTypeDetailScreen } from '@/features/admin/catalogs/PackagingTypeDetailScreen'

export const metadata: Metadata = { title: 'Detalle de Tipo de Embalaje' }

export default async function AdminPackagingTypeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <SetPageTitle title="Detalle de Tipo de Embalaje" />
      <PackagingTypeDetailScreen packagingTypeId={id} />
    </>
  )
}
