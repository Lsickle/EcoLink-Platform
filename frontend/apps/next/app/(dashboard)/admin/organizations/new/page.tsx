import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { CreateOrganizationForm } from '@/features/admin/CreateOrganizationForm'

export const metadata: Metadata = { title: 'Crear Organización' }

export default function AdminNewOrganizationPage() {
  return (
    <>
      <SetPageTitle title="Crear Organización" />
      <CreateOrganizationForm />
    </>
  )
}
