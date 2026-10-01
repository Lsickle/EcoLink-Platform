import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { VehicleDetailScreen } from '@/features/admin/VehicleDetailScreen'

export const metadata: Metadata = { title: 'Detalle de Vehículo' }

export default async function AdminVehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <SetPageTitle title="Detalle de Vehículo" />
      <VehicleDetailScreen vehicleId={id} />
    </>
  )
}
