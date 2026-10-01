import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { CreatePackagingConditionForm } from '@/features/admin/catalogs/CreatePackagingConditionForm'

export const metadata: Metadata = { title: 'Crear Estado del Embalaje' }

export default function AdminNewPackagingConditionPage() {
  return (
    <>
      <SetPageTitle title="Crear Estado del Embalaje" />
      <CreatePackagingConditionForm />
    </>
  )
}
