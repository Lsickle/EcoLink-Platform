import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { MunicipalitiesListScreen } from '@/features/admin/catalogs/MunicipalitiesListScreen'

export const metadata: Metadata = { title: 'Municipios' }

export default function AdminMunicipalitiesPage() {
  return (
    <>
      <SetPageTitle title="Municipios" />
      <MunicipalitiesListScreen />
    </>
  )
}
