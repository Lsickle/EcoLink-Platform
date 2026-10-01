import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { CreateVehicleForm } from '@/features/admin/CreateVehicleForm'

export const metadata: Metadata = { title: 'Crear Vehículo' }

export default function AdminNewVehiclePage() {
  return (
    <>
      <SetPageTitle title="Crear Vehículo" />
      <CreateVehicleForm />
    </>
  )
}
