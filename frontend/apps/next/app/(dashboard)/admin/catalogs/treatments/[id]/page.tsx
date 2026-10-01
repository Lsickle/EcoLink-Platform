import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { TreatmentDetailScreen } from '@/features/admin/catalogs/TreatmentDetailScreen'

export const metadata: Metadata = { title: 'Detalle de Tratamiento' }

export default async function AdminTreatmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <SetPageTitle title="Detalle de Tratamiento" />
      <TreatmentDetailScreen treatmentId={id} />
    </>
  )
}
