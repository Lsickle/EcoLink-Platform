import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { PermissionsListScreen } from '@/features/admin/PermissionsListScreen'

export const metadata: Metadata = { title: 'Permisos' }

export default function AdminPermissionsPage() {
  return (
    <>
      <SetPageTitle title="Permisos" />
      <PermissionsListScreen />
    </>
  )
}
