import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { BranchTreatmentDetailScreen } from '@/features/admin/BranchTreatmentDetailScreen'

export const metadata: Metadata = { title: 'Detalle de Tratamiento de Sede' }

export default async function AdminBranchTreatmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <SetPageTitle title="Detalle de Tratamiento de Sede" />
      <BranchTreatmentDetailScreen branchTreatmentId={id} />
    </>
  )
}
