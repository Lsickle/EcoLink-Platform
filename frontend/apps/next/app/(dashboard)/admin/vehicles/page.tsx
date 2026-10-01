import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { VehiclesListScreen } from '@/features/admin/VehiclesListScreen'

export const metadata: Metadata = { title: 'Vehículos' }

export default function AdminVehiclesPage() {
  return (
    <>
      <SetPageTitle title="Vehículos" />
      <VehiclesListScreen />
    </>
  )
}
