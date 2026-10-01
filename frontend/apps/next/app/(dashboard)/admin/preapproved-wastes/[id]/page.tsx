import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { PreapprovedWasteDetailScreen } from '@/features/admin/waste/PreapprovedWasteDetailScreen'

export const metadata: Metadata = { title: 'Detalle de Residuo Preaprobado' }

export default async function AdminPreapprovedWasteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <SetPageTitle title="Detalle de Residuo Preaprobado" />
      <PreapprovedWasteDetailScreen preapprovedWasteId={id} />
    </>
  )
}
