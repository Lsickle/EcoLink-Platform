import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { PhysicalStatesListScreen } from '@/features/admin/catalogs/PhysicalStatesListScreen'

export const metadata: Metadata = { title: 'Estado Físico' }

export default function AdminPhysicalStatesPage() {
  return (
    <>
      <SetPageTitle title="Estado Físico" />
      <PhysicalStatesListScreen />
    </>
  )
}
