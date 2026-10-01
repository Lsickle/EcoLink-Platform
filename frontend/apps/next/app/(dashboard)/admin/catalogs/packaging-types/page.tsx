import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { PackagingTypesListScreen } from '@/features/admin/catalogs/PackagingTypesListScreen'

export const metadata: Metadata = { title: 'Tipos de Embalaje' }

export default function AdminPackagingTypesPage() {
  return (
    <>
      <SetPageTitle title="Tipos de Embalaje" />
      <PackagingTypesListScreen />
    </>
  )
}
