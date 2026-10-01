import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { BranchTypesListScreen } from '@/features/admin/catalogs/BranchTypesListScreen'

export const metadata: Metadata = { title: 'Tipos de Sucursal' }

export default function AdminBranchTypesPage() {
  return (
    <>
      <SetPageTitle title="Tipos de Sucursal" />
      <BranchTypesListScreen />
    </>
  )
}
