import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { TreatmentApprovalsListScreen } from '@/features/admin/waste/TreatmentApprovalsListScreen'

export const metadata: Metadata = { title: 'Evaluaciones de Tratamiento' }

export default function AdminTreatmentApprovalsPage() {
  return (
    <>
      <SetPageTitle title="Evaluaciones de Tratamiento" />
      <TreatmentApprovalsListScreen />
    </>
  )
}
