import { DashboardShell } from '@/components/dashboard-shell'
import { WorkflowsListScreen } from '@/features/admin/workflow/WorkflowsListScreen'

export default function AdminWorkflowsPage() {
  return (
    <DashboardShell title="Workflows">
      <WorkflowsListScreen />
    </DashboardShell>
  )
}
