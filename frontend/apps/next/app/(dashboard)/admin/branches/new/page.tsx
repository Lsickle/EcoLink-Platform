import type { Metadata } from 'next'
import { Suspense } from 'react'
import { SetPageTitle } from '@/components/page-title'
import { EcoLinkSpinner } from '@/components/ecolink-spinner'
import { CreateBranchForm } from '@/features/admin/CreateBranchForm'

export const metadata: Metadata = { title: 'Crear Sucursal' }

export default function AdminNewBranchPage() {
  return (
    <>
      <SetPageTitle title="Crear Sucursal" />
      <Suspense fallback={<div className="p-4"><EcoLinkSpinner label="Cargando formulario…" /></div>}>
        <CreateBranchForm />
      </Suspense>
    </>
  )
}
