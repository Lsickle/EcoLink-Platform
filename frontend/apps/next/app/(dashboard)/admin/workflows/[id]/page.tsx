import type { Metadata } from 'next'
import { SetPageTitle } from '@/components/page-title'
import { WorkflowDetailScreen } from '@/features/admin/workflow/WorkflowDetailScreen'

export const metadata: Metadata = { title: 'Detalle de Workflow' }

export default async function AdminWorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <SetPageTitle title="Detalle de Workflow" />
      <WorkflowDetailScreen workflowId={id} />
    </>
  )
}
