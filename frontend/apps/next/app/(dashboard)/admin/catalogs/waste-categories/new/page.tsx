import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { CreateWasteCategoryForm } from '@/features/admin/catalogs/CreateWasteCategoryForm'

export const metadata: Metadata = { title: 'Crear Categoría de Residuo' }

export default function AdminNewWasteCategoryPage() {
  return (
    <>
      <SetPageTitle title="Crear Categoría de Residuo" />
      <CreateWasteCategoryForm />
    </>
  )
}
