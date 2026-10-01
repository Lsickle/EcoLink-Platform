import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { LocalitiesListScreen } from '@/features/admin/catalogs/LocalitiesListScreen'

export const metadata: Metadata = { title: 'Localidades' }

export default function AdminLocalitiesPage() {
  return (
    <>
      <SetPageTitle title="Localidades" />
      <LocalitiesListScreen />
    </>
  )
}
