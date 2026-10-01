import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { BranchDetailScreen } from '@/features/admin/BranchDetailScreen'

export const metadata: Metadata = { title: 'Detalle de Sucursal' }

export default async function AdminBranchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <SetPageTitle title="Detalle de Sucursal" />
      <BranchDetailScreen branchId={id} />
    </>
  )
}
