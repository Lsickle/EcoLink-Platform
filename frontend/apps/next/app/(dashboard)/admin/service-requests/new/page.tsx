import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { ServiceRequestWizard } from '@/features/admin/service-requests/ServiceRequestWizard'

export const metadata: Metadata = { title: 'Nueva Solicitud de Servicio' }

export default function AdminNewServiceRequestPage() {
  return (
    <>
      <SetPageTitle title="Nueva Solicitud de Servicio" />
      <ServiceRequestWizard />
    </>
  )
}
