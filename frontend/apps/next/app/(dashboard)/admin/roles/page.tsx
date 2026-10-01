import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { RolesListScreen } from '@/features/admin/RolesListScreen'

export const metadata: Metadata = { title: 'Roles' }

export default function AdminRolesPage() {
  return (
    <>
      <SetPageTitle title="Roles" />
      <RolesListScreen />
    </>
  )
}
