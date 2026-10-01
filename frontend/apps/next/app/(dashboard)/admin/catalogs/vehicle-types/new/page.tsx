import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { CreateVehicleTypeForm } from '@/features/admin/catalogs/CreateVehicleTypeForm'

export const metadata: Metadata = { title: 'Crear Tipo de Vehículo' }

export default function AdminNewVehicleTypePage() {
  return (
    <>
      <SetPageTitle title="Crear Tipo de Vehículo" />
      <CreateVehicleTypeForm />
    </>
  )
}
