'use client'

import { useParams } from 'solito/navigation'
import { DashboardShell } from '@/components/dashboard-shell'
import { WasteWizard } from '@/features/admin/waste/WasteWizard'

const useWasteEditParams = useParams<{ id: string }>

export default function AdminEditWastePage() {
  const { id } = useWasteEditParams()

  return (
    <DashboardShell title="Editar Declaración de Residuo">
      <WasteWizard wasteId={id} />
    </DashboardShell>
  )
}
