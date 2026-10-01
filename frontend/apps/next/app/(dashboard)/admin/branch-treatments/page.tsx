import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { BranchTreatmentsListScreen } from '@/features/admin/BranchTreatmentsListScreen'

export const metadata: Metadata = { title: 'Tratamientos de Sucursal' }

export default function AdminBranchTreatmentsPage() {
  return (
    <>
      <SetPageTitle title="Tratamientos de Sucursal" />
      <BranchTreatmentsListScreen />
    </>
  )
}
