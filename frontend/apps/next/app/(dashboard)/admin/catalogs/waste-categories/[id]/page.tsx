import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { WasteCategoryDetailScreen } from '@/features/admin/catalogs/WasteCategoryDetailScreen'

export const metadata: Metadata = { title: 'Detalle de Categoría de Residuo' }

export default async function AdminWasteCategoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <SetPageTitle title="Detalle de Categoría de Residuo" />
      <WasteCategoryDetailScreen wasteCategoryId={id} />
    </>
  )
}
