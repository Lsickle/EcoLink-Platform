import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { OrganizationalAreasListScreen } from '@/features/admin/catalogs/OrganizationalAreasListScreen'

export const metadata: Metadata = { title: 'Áreas Organizacionales' }

export default function AdminOrganizationalAreasPage() {
  return (
    <>
      <SetPageTitle title="Áreas Organizacionales" />
      <OrganizationalAreasListScreen />
    </>
  )
}
