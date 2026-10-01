import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { ContactDetailScreen } from '@/features/admin/ContactDetailScreen'

export const metadata: Metadata = { title: 'Detalle de Contacto' }

export default async function AdminContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <SetPageTitle title="Detalle de Contacto" />
      <ContactDetailScreen contactId={id} />
    </>
  )
}
