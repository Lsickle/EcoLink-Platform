import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { PermissionDetailScreen } from '@/features/admin/PermissionDetailScreen'

export const metadata: Metadata = { title: 'Detalle de Permiso' }

export default async function AdminPermissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <SetPageTitle title="Detalle de Permiso" />
      <PermissionDetailScreen permissionId={id} />
    </>
  )
}
