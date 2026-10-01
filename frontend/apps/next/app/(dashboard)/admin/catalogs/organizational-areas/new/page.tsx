import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { CreateOrganizationalAreaForm } from '@/features/admin/catalogs/CreateOrganizationalAreaForm'

export const metadata: Metadata = { title: 'Crear Área Organizacional' }

export default function AdminNewOrganizationalAreaPage() {
  return (
    <>
      <SetPageTitle title="Crear Área Organizacional" />
      <CreateOrganizationalAreaForm />
    </>
  )
}
