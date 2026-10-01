import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { ServiceRequestDetailScreen } from '@/features/admin/service-requests/ServiceRequestDetailScreen'

export const metadata: Metadata = { title: 'Detalle de Solicitud de Servicio' }

export default async function AdminServiceRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <SetPageTitle title="Detalle de Solicitud de Servicio" />
      <ServiceRequestDetailScreen serviceRequestId={id} />
    </>
  )
}
