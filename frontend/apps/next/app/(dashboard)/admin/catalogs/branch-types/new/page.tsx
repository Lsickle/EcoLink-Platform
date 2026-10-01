import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { CreateBranchTypeForm } from '@/features/admin/catalogs/CreateBranchTypeForm'

export const metadata: Metadata = { title: 'Crear Tipo de Sucursal' }

export default function AdminNewBranchTypePage() {
  return (
    <>
      <SetPageTitle title="Crear Tipo de Sucursal" />
      <CreateBranchTypeForm />
    </>
  )
}
