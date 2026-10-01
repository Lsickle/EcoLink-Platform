import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { HazardCharacteristicsListScreen } from '@/features/admin/catalogs/HazardCharacteristicsListScreen'

export const metadata: Metadata = { title: 'Características de Peligrosidad' }

export default function AdminHazardCharacteristicsPage() {
  return (
    <>
      <SetPageTitle title="Características de Peligrosidad" />
      <HazardCharacteristicsListScreen />
    </>
  )
}
