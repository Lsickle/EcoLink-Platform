import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { RoleDetailScreen } from '@/features/admin/RoleDetailScreen'

export const metadata: Metadata = { title: 'Detalle de Rol' }

export default async function AdminRoleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <SetPageTitle title="Detalle de Rol" />
      <RoleDetailScreen roleId={id} />
    </>
  )
}
