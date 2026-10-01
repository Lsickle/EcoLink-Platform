import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { WastesListScreen } from '@/features/admin/waste/WastesListScreen'

export const metadata: Metadata = { title: 'Residuos' }

export default function AdminWastesPage() {
  return (
    <>
      <SetPageTitle title="Residuos" />
      <WastesListScreen />
    </>
  )
}
