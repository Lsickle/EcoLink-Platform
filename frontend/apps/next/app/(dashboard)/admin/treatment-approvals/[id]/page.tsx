import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { TreatmentApprovalDetailScreen } from '@/features/admin/waste/TreatmentApprovalDetailScreen'

export const metadata: Metadata = { title: 'Detalle de Evaluación de Tratamiento' }

export default async function AdminTreatmentApprovalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <SetPageTitle title="Detalle de Evaluación de Tratamiento" />
      <TreatmentApprovalDetailScreen treatmentApprovalId={id} />
    </>
  )
}
