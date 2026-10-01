import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { CreateTreatmentForm } from '@/features/admin/catalogs/CreateTreatmentForm'

export const metadata: Metadata = { title: 'Crear Tratamiento' }

export default function AdminNewTreatmentPage() {
  return (
    <>
      <SetPageTitle title="Crear Tratamiento" />
      <CreateTreatmentForm />
    </>
  )
}
