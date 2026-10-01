import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { UserDetailScreen } from '@/features/admin/UserDetailScreen'

export const metadata: Metadata = { title: 'Detalle de Usuario' }

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <SetPageTitle title="Detalle de Usuario" />
      <UserDetailScreen userId={id} />
    </>
  )
}
