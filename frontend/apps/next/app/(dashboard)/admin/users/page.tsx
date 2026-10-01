import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { UsersListScreen } from '@/features/admin/UsersListScreen'

export const metadata: Metadata = { title: 'Usuarios' }

export default function AdminUsersPage() {
  return (
    <>
      <SetPageTitle title="Usuarios" />
      <UsersListScreen />
    </>
  )
}
