import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { CountriesListScreen } from '@/features/admin/catalogs/CountriesListScreen'

export const metadata: Metadata = { title: 'Países' }

export default function AdminCountriesPage() {
  return (
    <>
      <SetPageTitle title="Países" />
      <CountriesListScreen />
    </>
  )
}
