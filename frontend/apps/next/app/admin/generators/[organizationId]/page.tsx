'use client'

import { useParams } from 'solito/navigation'
import { DashboardShell } from '@/components/dashboard-shell'
import { LinkedGeneratorDetailScreen } from '@/features/admin/LinkedGeneratorDetailScreen'

const useLinkedGeneratorDetailParams = useParams<{ organizationId: string }>

export default function AdminLinkedGeneratorDetailPage() {
  const { organizationId } = useLinkedGeneratorDetailParams()

  return (
    <DashboardShell title="Generador">
      <LinkedGeneratorDetailScreen organizationId={organizationId} />
    </DashboardShell>
  )
}
