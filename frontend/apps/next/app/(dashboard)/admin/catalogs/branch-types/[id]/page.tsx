import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { BranchTypeDetailScreen } from '@/features/admin/catalogs/BranchTypeDetailScreen'

export const metadata: Metadata = { title: 'Detalle de Tipo de Sucursal' }

export default async function AdminBranchTypeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <SetPageTitle title="Detalle de Tipo de Sucursal" />
      <BranchTypeDetailScreen branchTypeId={id} />
    </>
  )
}
