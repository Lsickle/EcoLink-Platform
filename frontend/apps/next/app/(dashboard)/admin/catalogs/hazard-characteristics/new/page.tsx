import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { CreateHazardCharacteristicForm } from '@/features/admin/catalogs/CreateHazardCharacteristicForm'

export const metadata: Metadata = { title: 'Crear Característica de Peligrosidad' }

export default function AdminNewHazardCharacteristicPage() {
  return (
    <>
      <SetPageTitle title="Crear Característica de Peligrosidad" />
      <CreateHazardCharacteristicForm />
    </>
  )
}
