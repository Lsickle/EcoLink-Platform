import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { VehicleTypesListScreen } from '@/features/admin/catalogs/VehicleTypesListScreen'

export const metadata: Metadata = { title: 'Tipos de Vehículo' }

export default function AdminVehicleTypesPage() {
  return (
    <>
      <SetPageTitle title="Tipos de Vehículo" />
      <VehicleTypesListScreen />
    </>
  )
}
