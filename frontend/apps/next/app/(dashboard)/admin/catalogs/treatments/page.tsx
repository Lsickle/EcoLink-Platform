import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { TreatmentsListScreen } from '@/features/admin/catalogs/TreatmentsListScreen'

export const metadata: Metadata = { title: 'Tratamientos' }

export default function AdminTreatmentsPage() {
  return (
    <>
      <SetPageTitle title="Tratamientos" />
      <TreatmentsListScreen />
    </>
  )
}
