import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { WasteCategoriesListScreen } from '@/features/admin/catalogs/WasteCategoriesListScreen'

export const metadata: Metadata = { title: 'Categoría de Residuo' }

export default function AdminWasteCategoriesPage() {
  return (
    <>
      <SetPageTitle title="Categoría de Residuo" />
      <WasteCategoriesListScreen />
    </>
  )
}
