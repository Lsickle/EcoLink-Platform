import { Suspense } from 'react'
import { DashboardShell } from '@/components/dashboard-shell'
import { CreateBranchForm } from '@/features/admin/CreateBranchForm'

export default function AdminNewBranchPage() {
  return (
    <DashboardShell title="Crear Sucursal">
      <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Cargando formulario...</div>}>
        <CreateBranchForm />
      </Suspense>
    </DashboardShell>
  )
}
