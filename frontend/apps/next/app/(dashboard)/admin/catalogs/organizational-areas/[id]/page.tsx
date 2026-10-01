import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { OrganizationalAreaDetailScreen } from '@/features/admin/catalogs/OrganizationalAreaDetailScreen'

export const metadata: Metadata = { title: 'Detalle de Área Organizacional' }

export default async function AdminOrganizationalAreaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <SetPageTitle title="Detalle de Área Organizacional" />
      <OrganizationalAreaDetailScreen organizationalAreaId={id} />
    </>
  )
}
