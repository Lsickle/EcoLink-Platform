import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { OrganizationSidebarModulesScreen } from '@/features/admin/OrganizationSidebarModulesScreen'

export const metadata: Metadata = { title: 'Módulos del Sidebar' }

export default async function AdminOrganizationSidebarModulesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <SetPageTitle title="Módulos del Sidebar" />
      <OrganizationSidebarModulesScreen organizationId={id} />
    </>
  )
}
