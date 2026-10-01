import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { CreatePackagingTypeForm } from '@/features/admin/catalogs/CreatePackagingTypeForm'

export const metadata: Metadata = { title: 'Crear Tipo de Embalaje' }

export default function AdminNewPackagingTypePage() {
  return (
    <>
      <SetPageTitle title="Crear Tipo de Embalaje" />
      <CreatePackagingTypeForm />
    </>
  )
}
