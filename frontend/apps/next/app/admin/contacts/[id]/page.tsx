'use client'

import { useParams } from 'solito/navigation'
import { DashboardShell } from '@/components/dashboard-shell'
import { ContactDetailScreen } from '@/features/admin/ContactDetailScreen'

const useContactDetailParams = useParams<{ id: string }>

export default function AdminContactDetailPage() {
  const { id } = useContactDetailParams()

  return (
    <DashboardShell title="Detalle de Contacto">
      <ContactDetailScreen contactId={id} />
    </DashboardShell>
  )
}
