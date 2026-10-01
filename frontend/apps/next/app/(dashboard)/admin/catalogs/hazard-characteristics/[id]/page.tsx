import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { HazardCharacteristicDetailScreen } from '@/features/admin/catalogs/HazardCharacteristicDetailScreen'

export const metadata: Metadata = { title: 'Detalle de Característica de Peligrosidad' }

export default async function AdminHazardCharacteristicDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <SetPageTitle title="Detalle de Característica de Peligrosidad" />
      <HazardCharacteristicDetailScreen hazardCharacteristicId={id} />
    </>
  )
}
