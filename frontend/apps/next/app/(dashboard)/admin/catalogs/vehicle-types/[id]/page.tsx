import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { VehicleTypeDetailScreen } from '@/features/admin/catalogs/VehicleTypeDetailScreen'

export const metadata: Metadata = { title: 'Detalle de Tipo de Vehículo' }

export default async function AdminVehicleTypeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <SetPageTitle title="Detalle de Tipo de Vehículo" />
      <VehicleTypeDetailScreen vehicleTypeId={id} />
    </>
  )
}
