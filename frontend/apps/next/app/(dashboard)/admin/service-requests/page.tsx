import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { ServiceRequestsListScreen } from '@/features/admin/service-requests/ServiceRequestsListScreen'

export const metadata: Metadata = { title: 'Solicitudes de Servicio' }

export default function AdminServiceRequestsPage() {
  return (
    <>
      <SetPageTitle title="Solicitudes de Servicio" />
      <ServiceRequestsListScreen />
    </>
  )
}
