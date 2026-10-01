import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { WorkflowsListScreen } from '@/features/admin/workflow/WorkflowsListScreen'

export const metadata: Metadata = { title: 'Workflows' }

export default function AdminWorkflowsPage() {
  return (
    <>
      <SetPageTitle title="Workflows" />
      <WorkflowsListScreen />
    </>
  )
}
