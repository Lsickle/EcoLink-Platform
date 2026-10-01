import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { CreatePhysicalStateForm } from '@/features/admin/catalogs/CreatePhysicalStateForm'

export const metadata: Metadata = { title: 'Crear Estado Físico' }

export default function AdminNewPhysicalStatePage() {
  return (
    <>
      <SetPageTitle title="Crear Estado Físico" />
      <CreatePhysicalStateForm />
    </>
  )
}
