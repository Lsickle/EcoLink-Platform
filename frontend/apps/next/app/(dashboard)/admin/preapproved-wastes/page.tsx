import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { PreapprovedWastesListScreen } from '@/features/admin/waste/PreapprovedWastesListScreen'

export const metadata: Metadata = { title: 'Residuos Preaprobados' }

export default function AdminPreapprovedWastesPage() {
  return (
    <>
      <SetPageTitle title="Residuos Preaprobados" />
      <PreapprovedWastesListScreen />
    </>
  )
}
