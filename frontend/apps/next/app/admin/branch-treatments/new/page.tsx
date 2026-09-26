import { Suspense } from 'react'
import { DashboardShell } from '@/components/dashboard-shell'
import { CreateBranchTreatmentForm } from '@/features/admin/CreateBranchTreatmentForm'

export default function AdminNewBranchTreatmentPage() {
  return (
    <DashboardShell title="Crear Tratamiento de Sede">
      <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Cargando formulario...</div>}>
        <CreateBranchTreatmentForm />
      </Suspense>
    </DashboardShell>
  )
}
