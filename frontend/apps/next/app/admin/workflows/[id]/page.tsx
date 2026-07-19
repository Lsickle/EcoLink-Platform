'use client'

import { useParams } from 'solito/navigation'
import { DashboardShell } from '@/components/dashboard-shell'
import { WorkflowDetailScreen } from '@/features/admin/workflow/WorkflowDetailScreen'

const useWorkflowDetailParams = useParams<{ id: string }>

export default function AdminWorkflowDetailPage() {
  const { id } = useWorkflowDetailParams()

  return (
    <DashboardShell title="Detalle de Workflow">
      <WorkflowDetailScreen workflowId={id} />
    </DashboardShell>
  )
}
