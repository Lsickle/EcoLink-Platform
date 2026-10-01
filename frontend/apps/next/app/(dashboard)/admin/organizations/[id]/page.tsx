import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { OrganizationDetailScreen } from '@/features/admin/OrganizationDetailScreen'

export const metadata: Metadata = { title: 'Detalle de Organización' }

export default async function AdminOrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <SetPageTitle title="Detalle de Organización" />
      <OrganizationDetailScreen organizationId={id} />
    </>
  )
}
