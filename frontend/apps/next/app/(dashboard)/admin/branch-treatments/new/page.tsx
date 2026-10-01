import type { Metadata } from 'next'
import { Suspense } from 'react'
import { SetPageTitle } from '@/components/page-title'
import { EcoLinkSpinner } from '@/components/ecolink-spinner'
import { CreateBranchTreatmentForm } from '@/features/admin/CreateBranchTreatmentForm'

export const metadata: Metadata = { title: 'Crear Tratamiento de Sede' }

export default function AdminNewBranchTreatmentPage() {
  return (
    <>
      <SetPageTitle title="Crear Tratamiento de Sede" />
      <Suspense fallback={<div className="p-4"><EcoLinkSpinner label="Cargando formulario…" /></div>}>
        <CreateBranchTreatmentForm />
      </Suspense>
    </>
  )
}
