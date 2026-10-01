import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { BranchesListScreen } from '@/features/admin/BranchesListScreen'

export const metadata: Metadata = { title: 'Sucursales' }

export default function AdminBranchesPage() {
  return (
    <>
      <SetPageTitle title="Sucursales" />
      <BranchesListScreen />
    </>
  )
}
