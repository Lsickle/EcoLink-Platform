import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { OrganizationsListScreen } from '@/features/admin/OrganizationsListScreen'

export const metadata: Metadata = { title: 'Organizaciones' }

export default function AdminOrganizationsPage() {
  return (
    <>
      <SetPageTitle title="Organizaciones" />
      <OrganizationsListScreen />
    </>
  )
}
