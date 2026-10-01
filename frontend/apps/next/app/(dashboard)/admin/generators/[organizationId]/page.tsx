import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { LinkedGeneratorDetailScreen } from '@/features/admin/LinkedGeneratorDetailScreen'

export const metadata: Metadata = { title: 'Generador' }

export default async function AdminLinkedGeneratorDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string }>
}) {
  const { organizationId } = await params

  return (
    <>
      <SetPageTitle title="Generador" />
      <LinkedGeneratorDetailScreen organizationId={organizationId} />
    </>
  )
}
